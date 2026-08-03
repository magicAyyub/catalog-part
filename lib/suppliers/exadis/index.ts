import {
  EXADIS_URLS,
  EXADIS_PERMUTATIONS,
  EXADIS_USER_AGENT,
  LOGIN_BODY_TPL,
  GET_CURRENT_USER_BODY,
  GET_LOGIN_INIT_PARAM_BODY,
  SEARCH_VEHICULE_BODY_TPL,
  SEARCH_ARTICLE_BY_REF_BODY_TPL,
  GET_ARTICLE_DISPOPRIX_BODY,
} from './templates';
import { parseRpc4StringTable, type VehicleFields } from './rpc4-parser';
import { buildRpc5Body } from './rpc5-builder';
import { parseRpc5StringTable } from './rpc5-parser';
import {
  buildHeaders,
  getSetCookieArr,
  mergeCookies,
  extractStringTable,
  parsePriceFr,
} from './gwt-codec';
import { extractStockTokens, decodeStockLabel, type StockToken } from './stock-decoder';
import type { ExadisSupplierSession } from '@/lib/session-store';
import { setSession } from '@/lib/session-store';
import {
  SessionExpiredError,
  type ProductCategory,
  type Supplier,
  type SupplierProduct,
  type SupplierSession,
} from '../base';

interface ExadisSessionState {
  accessToken: string;
  cookies: string;
}

const TTL_MS = 60 * 60 * 1000; // 1 小时

/** 内存态 `SupplierSession`（base）→ 磁盘 `ExadisSupplierSession`（与 Préférence 并存于 session-store） */
function toExadisFileSession(session: SupplierSession): ExadisSupplierSession {
  const st = session.state as unknown as ExadisSessionState;
  return {
    supplier: 'exadis',
    cookies: st.cookies,
    accessToken: st.accessToken,
    loggedInAt: session.loggedInAt,
    lastActivity: Date.now(),
    userAgent: EXADIS_USER_AGENT,
  };
}

/** 登录成功后写入 `.cache/supplier-sessions.json`，供后续 API 与 Préférence 会话并列恢复 */
export async function persistExadisSession(session: SupplierSession): Promise<void> {
  await setSession('exadis', toExadisFileSession(session));
}

/** GET_ARTICLE_DISPOPRIX_BODY 中按出现顺序排列的 9 个 articleId，用于 split-join 替换为 RPC #5 结果 */
const RPC6_TEMPLATE_ARTICLE_IDS: readonly string[] = [
  '1239071',
  '1239003',
  '1104008',
  '1104461',
  '1396204',
  '1396186',
  '1396203',
  '1396187',
  '1507390',
];

/** Step6 字符串池里仅 net/cost 在 Double 段出现时的 brut TTC（池下标，与 PoC 一致） */
const STEP6_POOL_GROSS_IDX: Partial<Record<number, number>> = { 0: 14, 1: 20 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 解析 getArticleDispoPrix 响应里字符串池之前的 payload：按 `3,productIdx,2` 分段收集 literal Double。
 */
function parseStep6Prices(respBody: string): Array<{ productIdx: number; doubles: number[] }> {
  const poolStart = respBody.lastIndexOf('["');
  if (poolStart < 0) return [];
  const payload = respBody.slice(5, poolStart);
  const tokens = payload.split(',').map((t) => t.trim());
  const out: Array<{ productIdx: number; doubles: number[] }> = [];
  const segLen = 80;

  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i] === '3' && tokens[i + 2] === '2' && /^\d+$/.test(tokens[i + 1])) {
      const productIdx = parseInt(tokens[i + 1], 10);
      const segEnd = i;
      const segStart = Math.max(0, segEnd - segLen);
      const segment = tokens.slice(segStart, segEnd);
      const doubles: number[] = [];
      for (const t of segment) {
        if (/^\d+\.\d+$/.test(t)) {
          const n = parseFloat(t);
          if (n !== 20.0 && n !== 0.0) doubles.push(n);
        }
      }
      out.push({ productIdx, doubles });
    }
  }
  out.sort((a, b) => a.productIdx - b.productIdx);
  return out;
}

/** RPC #6 single-batch result: per-position doubles + per-position stock token + the batch's own string pool */
interface Rpc6BatchResult {
  cookies: string;
  pool: string[];
  perPos: number[][]; // perPos[posInBatch] = parsed doubles for that batch slot
  stockPerPos: StockToken[]; // stockPerPos[posInBatch] = (depotCode, quantity)
}

/** Per-product dispo/prix slot, aligned with the rpc5Products[] order. skipped=true for virtual articles. */
interface PerProductSlot {
  doubles: number[];
  pool: string[];
  posInBatch: number;
  stockToken: StockToken;
  skipped: boolean;
}

/**
 * 调一次 RPC #6 (getArticleDispoPrix), 最多 9 个 articleId.
 * 不足 9 个时用最后一个 ID 重复填充 (与原 hardcoded body 逻辑一致).
 * 服务端无状态, 同 session 多次串行调用安全.
 */
async function callRpc6(args: {
  accessToken: string;
  cookies: string;
  refererToken: string;
  articleIds: string[];
}): Promise<Rpc6BatchResult> {
  const { accessToken, cookies, refererToken, articleIds } = args;
  if (articleIds.length === 0 || articleIds.length > 9) {
    throw new Error(`callRpc6: expected 1..9 articleIds, got ${articleIds.length}`);
  }
  const padded: string[] = [];
  for (let i = 0; i < 9; i++) {
    padded.push(articleIds[i] ?? articleIds[articleIds.length - 1]!);
  }
  let body = GET_ARTICLE_DISPOPRIX_BODY;
  for (let i = 0; i < 9; i++) {
    body = body.split(RPC6_TEMPLATE_ARTICLE_IDS[i]!).join(padded[i]!);
  }
  const resp = await fetch(`${EXADIS_URLS.ECAT_BASE}/ecatASvc`, {
    method: 'POST',
    headers: buildHeaders({
      permutation: EXADIS_PERMUTATIONS.ECATVL,
      moduleBase: 'https://ecat.exadis.fr/ecatvl/ecat_vl/',
      referer: refererToken,
      accessToken,
      cookies,
    }),
    body,
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new SessionExpiredError('exadis');
  }
  if (!resp.ok) throw new Error(`Exadis price HTTP ${resp.status}`);
  const text = await resp.text();
  const newCookies = mergeCookies(cookies, getSetCookieArr(resp));
  const pool = extractStringTable(text) ?? [];
  const parsed = parseStep6Prices(text);
  const perPos: number[][] = Array.from({ length: 9 }, () => []);
  for (const p of parsed) {
    if (p.productIdx >= 0 && p.productIdx < 9) {
      perPos[p.productIdx] = p.doubles;
    }
  }
  const stockPerPos = extractStockTokens(text, pool);
  return { cookies: newCookies, pool, perPos, stockPerPos };
}

function step6DoublesToPriceFields(
  productIdx: number,
  doubles: number[],
  pool: string[]
): Pick<SupplierProduct, 'priceNet' | 'priceGross' | 'priceCost' | 'discountPct'> {
  const d = doubles.map(round2);
  let priceNet: number | null = null;
  let priceGross: number | null = null;
  let priceCost: number | null = null;
  let discountPct: number | null = null;

  if (d.length >= 4) {
    discountPct = d[0];
    priceCost = d[1];
    priceNet = d[2];
    priceGross = d[3];
  } else if (d.length === 3) {
    const [a, b, c] = d;
    // 末项为 net 重复。高价行 (FEBI)：首数为 brut、次为 net；低价行 (LPR/ATE)：首为 cost、次为 net，brut 仅在字符串池
    if (Math.abs(b - c) < 0.02) {
      if (a > 70 && b > 50) {
        priceGross = a;
        priceNet = b;
      } else {
        priceCost = a;
        priceNet = b;
        const gi = STEP6_POOL_GROSS_IDX[productIdx];
        if (gi !== undefined) priceGross = parsePriceFr(pool[gi]);
      }
    }
  }

  return { priceNet, priceGross, priceCost, discountPct };
}

export class ExadisSupplier implements Supplier {
  readonly name = 'exadis' as const;

  /**
   * 单实例 + 同一车牌的 RPC #4 去重: 同一 supplier 实例上 plaquette 与 disque 两次 search()
   * 并发跑时, 只发一次 searchVehiculeByImmatOrVin (服务端响应慢且无类目维度).
   * key = sessionCookies.slice(0,40) + plate, 跨 plate / 跨 session 自动失效.
   */
  private vehicleCache?: {
    key: string;
    promise: Promise<{ vf: VehicleFields; cookies: string }>;
  };

  /** 取已缓存的 K-Type (同 plate; 无缓存或未解析时返回 null). */
  async getCachedKType(plate: string): Promise<string | null> {
    if (!this.vehicleCache) return null;
    if (!this.vehicleCache.key.endsWith(`::${plate}`)) return null;
    try {
      const { vf } = await this.vehicleCache.promise;
      return vf.kType ?? null;
    } catch {
      return null;
    }
  }

  private async fetchVehicleFields(
    plate: string,
    session: SupplierSession
  ): Promise<{ vf: VehicleFields; cookies: string }> {
    const { accessToken, cookies: cookiesInitial } = session.state as unknown as ExadisSessionState;
    const cacheKey = `${cookiesInitial.slice(0, 40)}::${plate}`;
    if (this.vehicleCache && this.vehicleCache.key === cacheKey) {
      return this.vehicleCache.promise;
    }
    const refererToken = `https://ecat.exadis.fr/ecatvl/?access_token=${accessToken}`;
    const p = (async (): Promise<{ vf: VehicleFields; cookies: string }> => {
      const vehicleBody = SEARCH_VEHICULE_BODY_TPL.replace('{PLATE}', plate);
      const vehResp = await fetch(`${EXADIS_URLS.ECAT_BASE}/ecatVSvc`, {
        method: 'POST',
        headers: buildHeaders({
          permutation: EXADIS_PERMUTATIONS.ECATVL,
          moduleBase: 'https://ecat.exadis.fr/ecatvl/ecat_vl/',
          referer: refererToken,
          accessToken,
          cookies: cookiesInitial,
        }),
        body: vehicleBody,
      });
      if (vehResp.status === 401 || vehResp.status === 403) {
        throw new SessionExpiredError('exadis');
      }
      if (!vehResp.ok) throw new Error(`Exadis vehicle search HTTP ${vehResp.status}`);
      const vehText = await vehResp.text();
      const mergedCookies = mergeCookies(cookiesInitial, getSetCookieArr(vehResp));
      const vehTable = extractStringTable(vehText);
      if (!vehTable || vehTable.length === 0) {
        throw new Error(`Exadis vehicle search: empty string table for plate ${plate}`);
      }
      const vf = parseRpc4StringTable(vehTable, plate);
      console.log(
        `[exadis] RPC #4 OK: K-Type=${vf.kType}, vehicle segment ${vf.vehicleSegment.length} fields`
      );
      return { vf, cookies: mergedCookies };
    })();
    this.vehicleCache = { key: cacheKey, promise: p };
    return p;
  }

  async login(): Promise<SupplierSession> {
    if (process.env.EXADIS_TLS_INSECURE === '1') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const username = process.env.EXADIS_USERNAME;
    const password = process.env.EXADIS_PASSWORD;
    if (!username || !password) {
      throw new Error('Missing EXADIS_USERNAME / EXADIS_PASSWORD');
    }

    // === Step 1: portal login ===
    const loginBody = LOGIN_BODY_TPL.replace('{USERNAME}', username).replace(
      '{PASSWORD}',
      password
    );
    const loginResp = await fetch(EXADIS_URLS.PORTAL_SVC, {
      method: 'POST',
      headers: buildHeaders({
        permutation: EXADIS_PERMUTATIONS.PORTAL,
        moduleBase: 'https://ecat.exadis.fr/ecat_portail/',
        referer: 'https://ecat.exadis.fr/index.html',
      }),
      body: loginBody,
    });
    if (!loginResp.ok) throw new Error(`Exadis login HTTP ${loginResp.status}`);
    const loginText = await loginResp.text();
    let cookies = mergeCookies('', getSetCookieArr(loginResp));

    const loginTable = extractStringTable(loginText);
    const accessToken = loginTable?.find((s) => /^[a-z0-9]{35,45}$/.test(s));
    if (!accessToken) throw new Error('Exadis login: no access_token found');

    // === Step 1.5: SSO exchange (绑定 token 到 server session) ===
    const ssoResp = await fetch(`${EXADIS_URLS.SSO_EXCHANGE}?access_token=${accessToken}`, {
      method: 'GET',
      headers: {
        'User-Agent': EXADIS_USER_AGENT,
        Cookie: cookies,
        Referer: 'https://ecat.exadis.fr/index.html',
      },
      redirect: 'follow',
    });
    if (!ssoResp.ok) throw new Error(`Exadis SSO exchange HTTP ${ssoResp.status}`);
    cookies = mergeCookies(cookies, getSetCookieArr(ssoResp));
    await ssoResp.text(); // 消费 body

    // === Step 2: getCurrentUser (服务端期望客户端调过) ===
    const refererToken = `https://ecat.exadis.fr/ecatvl/?access_token=${accessToken}`;
    const getUserResp = await fetch(`${EXADIS_URLS.ECAT_BASE}/ecatAuthSvc`, {
      method: 'POST',
      headers: buildHeaders({
        permutation: EXADIS_PERMUTATIONS.ECATVL,
        moduleBase: 'https://ecat.exadis.fr/ecatvl/ecat_vl/',
        referer: refererToken,
        accessToken,
        cookies,
      }),
      body: GET_CURRENT_USER_BODY,
    });
    if (!getUserResp.ok) throw new Error(`Exadis getCurrentUser HTTP ${getUserResp.status}`);
    cookies = mergeCookies(cookies, getSetCookieArr(getUserResp));
    await getUserResp.text();

    // === Step 3: getLoginInitParam ===
    const initResp = await fetch(`${EXADIS_URLS.ECAT_BASE}/ecatSvc`, {
      method: 'POST',
      headers: buildHeaders({
        permutation: EXADIS_PERMUTATIONS.ECATVL,
        moduleBase: 'https://ecat.exadis.fr/ecatvl/ecat_vl/',
        referer: refererToken,
        accessToken,
        cookies,
      }),
      body: GET_LOGIN_INIT_PARAM_BODY,
    });
    if (!initResp.ok) throw new Error(`Exadis getLoginInitParam HTTP ${initResp.status}`);
    cookies = mergeCookies(cookies, getSetCookieArr(initResp));
    await initResp.text();

    const now = Date.now();
    const session: SupplierSession = {
      supplier: 'exadis',
      loggedInAt: now,
      expiresAt: now + TTL_MS,
      state: { accessToken, cookies } as Record<string, unknown>,
    };
    await persistExadisSession(session);
    return session;
  }

  async search(
    plate: string,
    session: SupplierSession,
    category: ProductCategory = 'plaquette'
  ): Promise<SupplierProduct[]> {
    const { accessToken } = session.state as unknown as ExadisSessionState;
    const refererToken = `https://ecat.exadis.fr/ecatvl/?access_token=${accessToken}`;

    // === Step 4: searchVehiculeByImmatOrVin (实例内同 plate 去重) ===
    const { vf, cookies: cookiesAfterVeh } = await this.fetchVehicleFields(plate, session);
    let cookies = cookiesAfterVeh;

    const articleBody = buildRpc5Body(vf, category);
    if (articleBody === null) {
      console.warn(
        `[exadis] unsupported vehicleSegment.length=${vf.vehicleSegment.length}, plate=${plate}, category=${category}`
      );
      return [];
    }

    // === Step 5: searchArticleByVehicule ===
    const artResp = await fetch(`${EXADIS_URLS.ECAT_BASE}/ecatASvc`, {
      method: 'POST',
      headers: buildHeaders({
        permutation: EXADIS_PERMUTATIONS.ECATVL,
        moduleBase: 'https://ecat.exadis.fr/ecatvl/ecat_vl/',
        referer: refererToken,
        accessToken,
        cookies,
      }),
      body: articleBody,
    });
    if (artResp.status === 401 || artResp.status === 403) {
      throw new SessionExpiredError('exadis');
    }
    if (!artResp.ok) throw new Error(`Exadis article search HTTP ${artResp.status}`);
    const artText = await artResp.text();
    cookies = mergeCookies(cookies, getSetCookieArr(artResp));
    const step5Table = extractStringTable(artText);
    if (!step5Table?.length) {
      throw new Error('Exadis searchArticleByVehicule: empty string table');
    }

    const rpc5Products = parseRpc5StringTable(step5Table, category);
    console.log(
      `[exadis] RPC #5 OK (${category}): ${rpc5Products.length} products parsed`
    );
    if (rpc5Products.length === 0) {
      return [];
    }

    // === Step 6: getArticleDispoPrix (multi-batch, 9 IDs per call) ===
    // 服务端无状态: 同 session 串行调若干批后合并结果, 按 RPC #5 原顺序 join 回品牌/ref.
    // virtual article (articleId='') 跳过 RPC #6, 价格留 null 输出.
    const { perProduct, cookies: cookiesAfterPrices } = await this.fetchPricesForRpc5(
      rpc5Products,
      { accessToken, refererToken, cookies },
      (msg) => console.log(`[exadis] ${msg}`)
    );
    cookies = cookiesAfterPrices;

    const products: SupplierProduct[] = [];
    for (let pi = 0; pi < rpc5Products.length; pi++) {
      const p5 = rpc5Products[pi]!;
      const slot = perProduct[pi]!;
      const { priceNet, priceGross, priceCost, discountPct } = slot.skipped
        ? { priceNet: null, priceGross: null, priceCost: null, discountPct: null }
        : step6DoublesToPriceFields(slot.posInBatch, slot.doubles, slot.pool);
      products.push({
        brand: p5.brand,
        reference: p5.reference,
        priceNet,
        priceGross,
        priceCost,
        discountPct,
        stock: decodeStockLabel(slot.stockToken),
        supplier: 'exadis',
        axle: p5.axle,
        productType: p5.productType,
        raw: {
          articleId: p5.articleId,
          stockId: p5.stockId,
          step5StringCount: step5Table.length,
          step6Doubles: slot.doubles,
          stockDepotCode: slot.stockToken.depotCode,
          stockQuantity: slot.stockToken.quantity,
        },
      });
    }

    return products;
  }

  /**
   * 共享 RPC #6 batching: 排除 articleId='' (虚拟) 的 product, 其余分 9-id batch 串行调用.
   * 返回与 rpc5Products 一一对应的 perProduct[], virtual slot 标记 skipped=true.
   */
  private async fetchPricesForRpc5(
    rpc5Products: ReadonlyArray<{ articleId: string }>,
    args: { accessToken: string; refererToken: string; cookies: string },
    log?: (msg: string) => void
  ): Promise<{ perProduct: PerProductSlot[]; cookies: string }> {
    const { accessToken, refererToken } = args;
    let { cookies } = args;

    // 建立 queryable index → original pi 的映射
    const queryable: Array<{ pi: number }> = [];
    for (let pi = 0; pi < rpc5Products.length; pi++) {
      if (rpc5Products[pi]!.articleId) queryable.push({ pi });
    }

    const BATCH_SIZE = 9;
    const numBatches = Math.ceil(queryable.length / BATCH_SIZE);
    const perProduct: PerProductSlot[] = rpc5Products.map(() => ({
      doubles: [],
      pool: [],
      posInBatch: 0,
      stockToken: { depotCode: null, quantity: null },
      skipped: true,
    }));

    for (let b = 0; b < numBatches; b++) {
      if (b > 0) await new Promise((r) => setTimeout(r, 100));
      const offset = b * BATCH_SIZE;
      const sliceQ = queryable.slice(offset, offset + BATCH_SIZE);
      const ids = sliceQ.map((q) => rpc5Products[q.pi]!.articleId);
      const batch = await callRpc6({ accessToken, cookies, refererToken, articleIds: ids });
      cookies = batch.cookies;
      for (let posInBatch = 0; posInBatch < sliceQ.length; posInBatch++) {
        const pi = sliceQ[posInBatch]!.pi;
        perProduct[pi] = {
          doubles: batch.perPos[posInBatch] ?? [],
          pool: batch.pool,
          posInBatch,
          stockToken: batch.stockPerPos[posInBatch] ?? { depotCode: null, quantity: null },
          skipped: false,
        };
      }
      log?.(`RPC #6 batch ${b + 1}/${numBatches} OK (${sliceQ.length} products in batch)`);
    }
    return { perProduct, cookies };
  }

  /**
   * Ref-search: 按货号查 Exadis catalog. 复用 RPC #5 parser + RPC #6 dispo/prix batching,
   * 跳过 plate-search 的 RPC #4 + vehicleSegment 步骤.
   * SAZ 1827 验证: fc=19 固定模板, ref 直接注入.
   */
  async searchByRef(ref: string, session: SupplierSession): Promise<SupplierProduct[]> {
    const trimmed = ref.trim();
    if (!trimmed) return [];
    const { accessToken, cookies: cookiesInitial } = session.state as unknown as ExadisSessionState;
    const refererToken = `https://ecat.exadis.fr/ecatvl/?access_token=${accessToken}`;

    // === Step ref-1: searchArticleByRef ===
    const body = SEARCH_ARTICLE_BY_REF_BODY_TPL.replace('{REF}', trimmed);
    const resp = await fetch(`${EXADIS_URLS.ECAT_BASE}/ecatASvc`, {
      method: 'POST',
      headers: buildHeaders({
        permutation: EXADIS_PERMUTATIONS.ECATVL,
        moduleBase: 'https://ecat.exadis.fr/ecatvl/ecat_vl/',
        referer: refererToken,
        accessToken,
        cookies: cookiesInitial,
      }),
      body,
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new SessionExpiredError('exadis');
    }
    if (!resp.ok) throw new Error(`Exadis searchArticleByRef HTTP ${resp.status}`);
    const text = await resp.text();
    const cookies = mergeCookies(cookiesInitial, getSetCookieArr(resp));
    const table = extractStringTable(text);
    if (!table?.length) {
      console.log(`[exadis] searchArticleByRef OK ref=${trimmed}: empty string table`);
      return [];
    }
    // RPC #5 parser 默认 'plaquette'; ref-search 混合类目, 这里只影响 productType 标签
    const rpc5Products = parseRpc5StringTable(table, 'plaquette');
    console.log(
      `[exadis] searchArticleByRef OK ref=${trimmed}: ${rpc5Products.length} articles parsed`
    );
    if (rpc5Products.length === 0) return [];

    // === Step ref-2: getArticleDispoPrix (9 IDs/batch) — 复用 plate-search 同一 helper ===
    const { perProduct } = await this.fetchPricesForRpc5(
      rpc5Products,
      { accessToken, refererToken, cookies }
    );

    const products: SupplierProduct[] = [];
    for (let pi = 0; pi < rpc5Products.length; pi++) {
      const p5 = rpc5Products[pi]!;
      const slot = perProduct[pi]!;
      const { priceNet, priceGross, priceCost, discountPct } = slot.skipped
        ? { priceNet: null, priceGross: null, priceCost: null, discountPct: null }
        : step6DoublesToPriceFields(slot.posInBatch, slot.doubles, slot.pool);
      products.push({
        brand: p5.brand,
        reference: p5.reference,
        priceNet,
        priceGross,
        priceCost,
        discountPct,
        stock: decodeStockLabel(slot.stockToken),
        supplier: 'exadis',
        axle: p5.axle,
        productType: p5.productType,
        raw: {
          articleId: p5.articleId,
          stockId: p5.stockId,
          step6Doubles: slot.doubles,
          stockDepotCode: slot.stockToken.depotCode,
          stockQuantity: slot.stockToken.quantity,
        },
      });
    }
    return products;
  }
}
