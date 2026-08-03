// lib/suppliers/preference - Préférence Seine portal (login, plate, catalogue, brake pads).

import * as cheerio from 'cheerio';

import {
  getSession,
  getSessionExpiresAt,
  isExpired,
  setSession,
} from '../../session-store';
import { logger } from '@/lib/logger';

const PREFERENCE_BASE = 'https://www.pfpreference-seine.fr';
const LOGIN_URL = `${PREFERENCE_BASE}/login.aspx`;
const CATALOG_URL = `${PREFERENCE_BASE}/catalogue/1-pieces-auto.aspx`;

/** TecDoc  ?  ?  ?? ? autocomplete  ?? name  ?  ? ? ?页面 CtrlAutoCompleteArtGen1  ? ?  ? */
const AC_ART_GEN_PREFIX =
  'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlAssemblys1$CtrlListShortcutsTemplateSelection1$CtrlAutoCompleteArtGen1';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**  ??误 ??类:  ?续 search() 根据 ? ? ? ?  ?  ?  ? */
export type PreferenceError =
  | 'SESSION_STALE'
  | 'INVALID_CREDENTIALS'
  | 'PLATE_NOT_FOUND'
  | 'NO_PRODUCTS'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'CAPTCHA_REQUIRED';

export interface VehicleInfo {
  carId: string;
  brand: string;
  model: string;
  version?: string;
  plate: string;
  /** TecDoc K-Type (来自 Exadis RPC #4), aggregate 时合并. */
  kType?: string;
}

export type AxleSide = 'avant' | 'arriere';
export type ProductType = 'plaquette' | 'disque';

/**
 * Préférence 详情页里 `span.unite` 元素汇总的物理规格. Disc/plaquette 共用 (各自只填本类目相关字段).
 * 用于 catalog miss 时合成 TecDoc-shaped enrichment (BOSCH BD#### 等非 TecDoc 货号场景).
 */
export interface PreferenceSpecs {
  /** Disque: "Diamètre extérieur" (mm). */
  outerDiameter?: number;
  /** Disque: "Épaisseur du disque de frein" / Plaquette: "Épaisseur" (mm). */
  thickness?: number;
  /** Disque: "Épaisseur min." (mm). */
  thicknessMin?: number;
  /** Disque/Plaquette: "Hauteur" (mm). */
  height?: number;
  /** Plaquette: "Longueur" (mm). */
  length?: number;
  /** Plaquette: "Largeur" (mm). */
  width?: number;
  /** Disque: "Cercle de perçage / PCD" (mm). */
  pcd?: number;
  /** Disque: 'ventilé' / 'plein'. */
  discType?: 'ventilé' | 'plein';
  /** Plaquette: "pour diam. du disque : 300 mm" — 适配的盘直径 (mm). */
  forDiscDiameter?: number;
  /** "Disponible à partir de : 03/2010". */
  yearFrom?: string;
  /** "Fin de disponibilité : 10/2011". */
  yearTo?: string;
}

export interface BrakePartResult {
  supplier: 'preference';
  brand: string;
  reference: string;
  codArt?: string;
  priceBase?: number;
  discountLabel?: string;
  priceNet?: number;
  inStock: boolean;
  stockLabel: string;
  wvaNumbers: string[];
  equivalentOf?: string;
  imageUrl?: string;
  description?: string;
  /** "Côté d'assemblage : Essieu avant/arrière" (source A) ou design label suffix " AV"/" AR" (source B). null = info absente. */
  axle: AxleSide | null;
  /** Catégorie demandée: 'plaquette' (Kit de plaquettes) ou 'disque' (Disque de frein). */
  productType: ProductType;
  /** 物理规格 (Préférence span.unite); 用于 catalog miss 时回填 TecDoc 字段. */
  specs?: PreferenceSpecs;
}

/** 把 "23,9" / "120" / "73.1" 这种法语/英语数字字符串转 number; 失败返回 undefined. */
function parseFrenchNumber(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 从详情文本块 (span.unite 串起的 "Label : Value mm, …") 提取规格.
 * productType-aware: disque 时 thickness 优先匹配 "Épaisseur du disque",
 * 排除 "de la plaquette"; plaquette 时反过来. 防止把 BD 商品页上配套的
 * "Épaisseur de la plaquette" 错当成 disc 厚度.
 * label-to-colon 用 `[^,:]{0,N}` 宽松匹配, 容忍 "Hauteur 1 :" 等变体.
 * 属性间 ` , ` 分隔, 所以 `[^,:]` 保证不会跨属性吃错.
 */
function extractPreferenceSpecs(text: string, productType: ProductType): PreferenceSpecs {
  const t = text.replace(/\s+/g, ' ');
  const out: PreferenceSpecs = {};

  /** label 模板 → 编译为 "label[^,:]{0,N}:\s*(value) mm". 法语逗号小数兼容. */
  const numUnit = (labelSrc: string, maxBetween = 40): number | undefined => {
    const re = new RegExp(
      labelSrc + String.raw`[^,:]{0,${maxBetween}}:\s*([\d\s]+(?:[,.]\d+)?)\s*mm`,
      'i'
    );
    const m = re.exec(t);
    return m ? parseFrenchNumber(m[1]) : undefined;
  };

  out.outerDiameter = numUnit(String.raw`Diam[èe]tre\s+ext[ée]rieur`);
  out.thicknessMin = numUnit(String.raw`[ÉE]paisseur\s+min`);

  // thickness: 优先 productType-specific 标签, 再 fallback 到裸 "Épaisseur" 但排除对方类目变体
  if (productType === 'disque') {
    out.thickness =
      numUnit(String.raw`[ÉE]paisseur\s+du\s+disque(?:\s+de\s+frein)?`) ??
      numUnit(String.raw`[ÉE]paisseur(?!\s+(?:min|de\s+(?:la\s+)?plaquette))`);
  } else {
    out.thickness =
      numUnit(String.raw`[ÉE]paisseur\s+de\s+(?:la\s+)?plaquette(?:\s+de\s+frein)?`) ??
      numUnit(String.raw`[ÉE]paisseur(?!\s+(?:min|du\s+disque))`);
  }

  out.height = numUnit(String.raw`Hauteur`);
  out.length = numUnit(String.raw`Longueur`);
  out.width = numUnit(String.raw`Largeur`);
  out.pcd = numUnit(String.raw`Cercle\s+de\s+per[cç]age`);
  // Plaquette: "pour diam. du disque : 300 mm" — 适配的盘 Ø
  out.forDiscDiameter = numUnit(String.raw`pour\s+diam\.?\s+du\s+disque`);

  const typeM = /Type\s+de\s+disque[^,:]{0,30}:\s*(ventil[ée]|plein)/i.exec(t);
  if (typeM) {
    out.discType = /^ventil/i.test(typeM[1]!) ? 'ventilé' : 'plein';
  }

  const fromM = /Disponible\s+[àa]\s+partir\s+de\s*:\s*(\d{2}\/\d{4})/i.exec(t);
  const toM = /Fin\s+de\s+disponibilit[ée]\s*:\s*(\d{2}\/\d{4})/i.exec(t);
  if (fromM) out.yearFrom = fromM[1];
  if (toM) out.yearTo = toM[1];
  // 校验: 如果 from > to (Préférence HTML 偶发不一致), 两个都丢弃
  if (out.yearFrom && out.yearTo) {
    const parse = (s: string): number | null => {
      const m = /^(\d{2})\/(\d{4})$/.exec(s);
      return m ? parseInt(m[2]!, 10) * 12 + parseInt(m[1]!, 10) : null;
    };
    const f = parse(out.yearFrom);
    const tt = parse(out.yearTo);
    if (f != null && tt != null && f > tt) {
      delete out.yearFrom;
      delete out.yearTo;
    }
  }

  return out;
}

/** specs 全空时返回 undefined, 避免无意义字段 */
function compactSpecs(s: PreferenceSpecs): PreferenceSpecs | undefined {
  const hasAny = Object.values(s).some((v) => v != null);
  return hasAny ? s : undefined;
}

export { PREFERENCE_BASE, LOGIN_URL, CATALOG_URL, DEFAULT_UA };

// Internal helpers exported for the vehicle-catalog DFS scrape in
// lib/suppliers/preference/vehicle-catalog.ts (Stage 5 vehicle DB build).
// Not part of the production search API contract.
export {
  buildHeaders as __internal_buildHeaders,
  mergeCookies as __internal_mergeCookies,
  getSetCookieArr as __internal_getSetCookieArr,
  extractAspNetFields as __internal_extractAspNetFields,
  extractViewStateFromUpdatePanel as __internal_extractViewStateFromUpdatePanel,
  extractEventValidationFromUpdatePanel as __internal_extractEventValidationFromUpdatePanel,
};

// ---  ?? ?  ? ?  ---

function getSetCookieArr(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  return typeof h.getSetCookie === 'function' ? h.getSetCookie() : [];
}

function buildHeaders(cookies: string, isAjaxPost: boolean = true): HeadersInit {
  const h: Record<string, string> = {
    'User-Agent': DEFAULT_UA,
    Accept: isAjaxPost
      ? '*/*'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    Cookie: cookies,
    Origin: PREFERENCE_BASE,
  };
  if (isAjaxPost) {
    h['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    h['X-Requested-With'] = 'XMLHttpRequest';
    h['X-MicrosoftAjax'] = 'Delta=true';
    h['Cache-Control'] = 'no-cache';
  }
  return h;
}

/**  ?  ?? <script>/<style> ?避 ?  datagrp JSON  ?? ??  ??plaquette ?  ??freinage ?  干 ?  __doPostBack  ?位 */
function stripScriptAndStyleTags(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

/** 页面 ?? ? 对路 ?  ?? 绝对 URL ? ? 端 `<img src>` 否 ?? ?以 Next  ??名为根 ?导 ?  404 ? */
function absolutizeSiteAssetUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const s = src.trim();
  if (!s) return undefined;
  if (s.startsWith('data:')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${PREFERENCE_BASE}${s}`;
  return `${PREFERENCE_BASE}/${s}`;
}

function mergeCookies(existing: string, setCookieHeaders: string[]): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split(';')) {
    const [k, ...rest] = pair.trim().split('=');
    if (k) jar.set(k, rest.join('='));
  }
  for (const sc of setCookieHeaders) {
    const firstPair = sc.split(';')[0];
    const [k, ...rest] = firstPair.split('=');
    if (k) jar.set(k.trim(), rest.join('=').trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractAspNetFields(html: string): {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
} {
  const re = (name: string) =>
    new RegExp(`<input[^>]*name="${name.replace(/\$/g, '\\$')}"[^>]*value="([^"]*)"`, 'i').exec(
      html
    )?.[1] ?? '';
  return {
    viewState: re('__VIEWSTATE'),
    viewStateGenerator: re('__VIEWSTATEGENERATOR'),
    eventValidation: re('__EVENTVALIDATION'),
  };
}

function extractPageRedirect(body: string): string | null {
  const m = /\|pageRedirect\|\|([^|]+)\|/.exec(body);
  return m ? decodeURIComponent(m[1]) : null;
}

/** UpdatePanel  ?  ?中 ?? __VIEWSTATE ? ? 式 POST  ?须 ?  ?  ?见工 ? ? §7 ? */
function extractViewStateFromUpdatePanel(body: string): string | null {
  const m = /\|__VIEWSTATE\|([^|]+)\|/.exec(body);
  return m ? m[1] : null;
}

function extractEventValidationFromUpdatePanel(body: string): string | null {
  const m = /\|__EVENTVALIDATION\|([^|]+)\|/.exec(body);
  return m ? m[1] : null;
}

/** Step B4  ?? 车 ?? POST ? ? lib  ?? ? 使 ?  ? */
async function plateSearchStep(plate: string): Promise<string> {
  const session = await getSession('preference');
  if (!session || (await isExpired(session))) {
    throw new Error('SESSION_STALE');
  }

  const plateNorm = plate.toLowerCase().replace(/[\s-]/g, '');

  const formData: Record<string, string> = {
    'ctl00$ScriptManager1':
      'ctl00$ContentPlaceHolder1$UpdatePanel1|ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$cmdSearchTypeMine',
    __EVENTTARGET:
      'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$cmdSearchTypeMine',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    __VIEWSTATE: session.viewState ?? '',
    __VIEWSTATEGENERATOR: session.viewStateGenerator ?? '',
    __SCROLLPOSITIONX: '0',
    __SCROLLPOSITIONY: '0',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$txtTypeMine':
      plateNorm,
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlVehiSelectorByModel1$drpMarques':
      '0',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlVehiSelectorByModel1$drpModels':
      '0',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlVehiSelectorByModel1$drpVehiculs':
      '0',
    __ASYNCPOST: 'true',
  };
  const body = new URLSearchParams(formData).toString();

  const resp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: { ...buildHeaders(session.cookies, true), Referer: CATALOG_URL },
    body,
  });
  if (!resp.ok) throw new Error(`plate search failed: ${resp.status}`);

  const respBody = await resp.text();
  const newCookies = mergeCookies(session.cookies, getSetCookieArr(resp));

  const redirect = extractPageRedirect(respBody);
  if (!redirect) {
    if (respBody.includes('login.aspx')) throw new Error('SESSION_STALE');
    throw new Error(`PLATE_NOT_FOUND: ${respBody.slice(0, 300)}`);
  }
  if (redirect.includes('/login.aspx')) throw new Error('SESSION_STALE');

  const newViewState = extractViewStateFromUpdatePanel(respBody);
  await setSession('preference', {
    ...session,
    cookies: newCookies,
    lastActivity: Date.now(),
    ...(newViewState ? { viewState: newViewState } : {}),
  });

  return redirect;
}

/** Step B5  ?? GET 车 ?页并解 ?  carId /  ?  ?? /  ??号 ? ? lib  ?? ? 使 ?  ? */
async function fetchHomeAndParseVehicle(redirectPath: string): Promise<{
  vehicle: VehicleInfo;
  html: string;
}> {
  const session = await getSession('preference');
  if (!session) throw new Error('SESSION_STALE');

  const url = redirectPath.startsWith('http')
    ? redirectPath
    : `${PREFERENCE_BASE}${redirectPath}`;

  const resp = await fetch(url, {
    headers: { ...buildHeaders(session.cookies, false), Referer: CATALOG_URL },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`home fetch failed: ${resp.status}`);

  const cataloguePageUrl = resp.url;

  const html = await resp.text();
  const newCookies = mergeCookies(session.cookies, getSetCookieArr(resp));

  let carId: string;
  let immat: string;
  const m1 = /carId="(\d+)"[^>]*immat="([^"]+)"/i.exec(html);
  if (m1) {
    carId = m1[1];
    immat = m1[2];
  } else {
    const m2 = /immat="([^"]+)"[^>]*carId="(\d+)"/i.exec(html);
    if (!m2) {
      if (html.includes('login.aspx')) throw new Error('SESSION_STALE');
      throw new Error('PLATE_NOT_FOUND: carId not in HTML');
    }
    carId = m2[2];
    immat = m2[1];
  }

  // Préférence ships TWO <span class="marque">: the MiniCart promo widget
  // (id="…lblfourn", which is the supplier of a featured product — often
  // "FAHREN" or a similar private label) AND the actual current-vehicle row
  // (id="…lblMarque" inside the "10 Derniers véhicules" panel, e.g. "BMW
  // (cg534wf)"). The legacy regex matched the first occurrence and silently
  // pulled the MiniCart supplier name instead of the real vehicle brand,
  // breaking every downstream consumer (OEM-highlight, ETF anchoring,
  // brand-matched filter, etc.). Anchor on the id to disambiguate.
  // The captured text typically reads "BMW (cg534wf)" — we strip the
  // parenthesised plate suffix via [^<(]+ as before.
  const brandMatch = /<span[^>]*id="[^"]*lblMarque"[^>]*>([^<(]+)/i.exec(html);
  const brand = brandMatch?.[1].trim() ?? '';

  const modelMatch = /<span[^>]*id="[^"]*lblModel"[^>]*>([^<]+)<\/span>/i.exec(html);
  const model = modelMatch?.[1].trim() ?? '';

  const homeFields = extractAspNetFields(html);
  await setSession('preference', {
    ...session,
    cookies: newCookies,
    cataloguePageUrl,
    viewState: homeFields.viewState,
    viewStateGenerator: homeFields.viewStateGenerator,
    ...(homeFields.eventValidation
      ? { eventValidation: homeFields.eventValidation }
      : {}),
    lastActivity: Date.now(),
  });

  return {
    vehicle: { carId, brand, model, plate: immat },
    html,
  };
}

function findCategoryEventTarget(html: string, categoryKeyword: string): string | null {
  const $ = cheerio.load(html);
  const kw = categoryKeyword.toLowerCase();
  let target: string | null = null;

  const tryExtract = (hay: string): string | null => {
    const m1 = /WebForm_PostBackOptions\(\s*&quot;([^&"]+)&quot;/.exec(hay);
    if (m1) return m1[1];
    const m2 = /WebForm_PostBackOptions\(\s*"([^"]+)"/.exec(hay);
    if (m2) return m2[1];
    const d1 = /__doPostBack\s*\(\s*'([^']+)'\s*,/i.exec(hay);
    if (d1) return d1[1];
    const d2 = /__doPostBack\s*\(\s*&#39;([^&#]+)&#39;\s*,/i.exec(hay);
    if (d2) return d2[1];
    return null;
  };

  $('a').each((_, el) => {
    const $el = $(el);
    const text = $el.text().toLowerCase();
    const href = $el.attr('href') || '';
    const onclick = $el.attr('onclick') || '';
    if (!text.includes(kw)) return;
    const t = tryExtract(`${href} ${onclick}`);
    if (t) {
      target = t;
      return false;
    }
  });
  if (target) return target;

  const lower = html.toLowerCase();
  let idx = 0;
  while ((idx = lower.indexOf(kw, idx)) !== -1) {
    const slice = html.slice(Math.max(0, idx - 500), Math.min(html.length, idx + 500));
    const t = tryExtract(slice);
    if (t) return t;
    idx += kw.length;
  }

  return null;
}

/**  ? 含 ?  ? 词 ?? HTML  ?口 ?? ?  ?  __doPostBack / WebForm_PostBackOptions ? ? ? 可 ? 不 ?  <a>  ?? ? ?  ?  ? */
function findPostBackTargetNearKeyword(html: string, needle: string): string | null {
  const lower = html.toLowerCase();
  const n = needle.toLowerCase();
  let idx = 0;
  while ((idx = lower.indexOf(n, idx)) !== -1) {
    const slice = html.slice(
      Math.max(0, idx - 800),
      Math.min(html.length, idx + 1200)
    );
    const d1 = /__doPostBack\s*\(\s*'([^']+)'\s*,/i.exec(slice);
    if (d1) return d1[1];
    const d2 = /__doPostBack\s*\(\s*&#39;([^&#]+)&#39;\s*,/i.exec(slice);
    if (d2) return d2[1];
    const w = /WebForm_PostBackOptions\(\s*"([^"]+)"/i.exec(slice);
    if (w) return w[1];
    const w2 = /WebForm_PostBackOptions\(\s*&quot;([^&"]+)&quot;/i.exec(slice);
    if (w2) return w2[1];
    idx += n.length;
  }
  return null;
}

/**  ? ?? ? `datagrp` JSON 解 ?  ??Kit de plaquettes de frein, frein à disque ?  ?? keycat/key ? ? select ??cmdFired  ? ?  ? */
function findBrakePadDatagrpKeys(
  html: string,
  category: ProductType
): { keycat: string; key: string } | null {
  if (category === 'disque') {
    const m =
      /label:\s*"Disque de frein"[^}]*keycat:\s*"(\d+)"\s*,\s*key:\s*"(\d+)"/i.exec(html);
    return m ? { keycat: m[1]!, key: m[2]! } : null;
  }
  const exact =
    /label:\s*"Kit de plaquettes de frein,\s*frein à disque"[^}]*keycat:\s*"(\d+)"\s*,\s*key:\s*"(\d+)"/i.exec(
      html
    );
  if (exact) return { keycat: exact[1], key: exact[2] };
  const loose =
    /label:\s*"[^"]*Kit de plaquettes de frein[^"]*"[^}]*keycat:\s*"(\d+)"\s*,\s*key:\s*"(\d+)"/i.exec(
      html
    );
  return loose ? { keycat: loose[1], key: loose[2] } : null;
}

function parseProductList(html: string, productType: ProductType | 'auto'): BrakePartResult[] {
  // Debug HTML dump (env-gated, off in prod). Set PREFERENCE_DEBUG_HTML_DUMP=1 then
  // run a /api/search call — every postback HTML body is saved to ./_pref_dump/.
  if (process.env.PREFERENCE_DEBUG_HTML_DUMP === '1') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fs: typeof import('fs') = (eval('require') as any)('fs');
      const path: typeof import('path') = (eval('require') as any)('path');
      const dir = path.join(process.cwd(), '_pref_dump');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(dir, `parseProductList_${productType}_${ts}.html`), html, 'utf-8');
    } catch {
      // swallow — debug only
    }
  }
  const $ = cheerio.load(html);
  const results: BrakePartResult[] = [];

  const parsePrice = (s: string): number | undefined => {
    const m = /([\d\s]+,\d+)/.exec(s);
    if (!m) return undefined;
    return parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  };

  // 'auto' (ref-search 用): 从每行 designation / description 文本判 disque vs plaquette.
  // Disque 关键词更具体 ("disque" 在制动配件里只指盘), plaquette 兜底.
  const detectProductType = (rowText: string): ProductType => {
    const t = rowText.toLowerCase();
    if (/\b(disque|disques)\s+de\s+frein\b/.test(t)) return 'disque';
    if (/\bdisque\b/.test(t) && !/plaquette/.test(t)) return 'disque';
    return 'plaquette';
  };

  $('table.articleTemplateSelection').each((_, table) => {
    const $t = $(table);
    const brand = $t.find('span.marque').first().text().trim();
    const reference = $t.find('span.refcde').first().text().trim();
    if (!brand || !reference) return;

    const priceBase = parsePrice($t.find('span.articlePrixBase').first().text());
    const discountLabel =
      $t.find('span.articlePrixRemise').first().text().trim() || undefined;
    const priceNet = parsePrice($t.find('span.articlePrixNet').first().text());

    const stockImg =
      $t.find('span[id*="ImgDocStatus"] img').first().attr('src') || '';
    let inStock = false;
    let stockLabel = 'unknown';
    // 顺序: 先匹配 "disposearch" (其后缀含 "ch" 不与 dispo3 等冲突, 但稳妥起见放最前)
    if (stockImg.includes('ico_disposearch')) {
      inStock = false;
      stockLabel = 'Non disponible';
    } else if (stockImg.includes('ico_dispo1')) {
      inStock = true;
      stockLabel = 'disponible';
    } else if (stockImg.includes('ico_dispo3')) {
      inStock = true;
      stockLabel = 'j+1';
    } else if (stockImg.includes('ico_dispo0')) {
      inStock = false;
      stockLabel = 'rupture';
    }

    const codArt =
      $t.find('a[codart]').first().attr('codart') ??
      $t.find('a[Codart]').first().attr('Codart') ??
      undefined;

    const equivMatch = /\(Equivalent de\s+([^)]+)\)/i.exec($t.text());
    const equivalentOf = equivMatch ? equivMatch[1].trim() : undefined;

    const wvaMatches = [...$t.text().matchAll(/num[ée]ro WVA\s*:\s*(\d+)/gi)];
    const wvaNumbers = wvaMatches.map((m) => m[1]);

    const imageUrlRaw =
      $t.find('img[codart]').first().attr('src') ??
      $t.find('img[CodArt]').first().attr('src') ??
      undefined;
    const imageUrl = absolutizeSiteAssetUrl(imageUrlRaw);

    const description =
      $t.find('.designation, .designContent').first().text().trim() || undefined;

    // axle: 三路提取 (ref-search 和 plate-search 的 HTML 结构略有差异):
    //   1. span.unite[Datatype="DTstring"] 属性行 (plate-search 详情视图)
    //   2. 整行 text() 里搜 "Côté d'assemblage : Essieu xxx" (ref-search 兜底, 结构变体)
    //   3. span.design 末尾 " AV"/" AR" 后缀
    let axle: AxleSide | null = null;
    const uniteSpans = $t.find('span.unite[Datatype="DTstring"]').toArray();
    for (const u of uniteSpans) {
      const txt = $(u).text();
      if (!/C[ôo]t[ée] d'assemblage/i.test(txt)) continue;
      if (/Essieu\s+avant/i.test(txt)) { axle = 'avant'; break; }
      if (/Essieu\s+arri[èe]re/i.test(txt)) { axle = 'arriere'; break; }
    }
    if (axle === null) {
      const fullText = $t.text();
      const m = /C[ôo]t[ée]\s+d'assemblage\s*:\s*Essieu\s+(avant|arri[èe]re)/i.exec(fullText);
      if (m) axle = /avant/i.test(m[1]!) ? 'avant' : 'arriere';
    }
    if (axle === null) {
      const designText = $t.find('span.design').first().text().trim();
      if (/\bAV\s*$/.test(designText)) axle = 'avant';
      else if (/\bAR\s*$/.test(designText)) axle = 'arriere';
    }

    const resolvedType: ProductType =
      productType === 'auto' ? detectProductType($t.text() + ' ' + (description ?? '')) : productType;
    const specs = compactSpecs(extractPreferenceSpecs($t.text(), resolvedType));

    results.push({
      supplier: 'preference',
      brand,
      reference,
      codArt,
      priceBase,
      discountLabel,
      priceNet,
      inStock,
      stockLabel,
      wvaNumbers,
      equivalentOf,
      imageUrl,
      description,
      axle,
      productType: resolvedType,
      specs,
    });
  });

  return results;
}

/** POST catalogue UpdatePanel ? ?  ?  session ? ? ??面板 ?? HTML ?可 ? 式 ?次 ? ?  ? */
async function postCatalogUpdatePanel(
  eventTarget: string,
  extraFields: Record<string, string> = {}
): Promise<string> {
  const session = await getSession('preference');
  if (!session) throw new Error('SESSION_STALE');

  const postUrl = session.cataloguePageUrl ?? CATALOG_URL;

  const formData: Record<string, string> = {
    'ctl00$ScriptManager1': `ctl00$ContentPlaceHolder1$UpdatePanel1|${eventTarget}`,
    __EVENTTARGET: eventTarget,
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    __VIEWSTATE: session.viewState ?? '',
    __VIEWSTATEGENERATOR: session.viewStateGenerator ?? '',
    __SCROLLPOSITIONX: '0',
    __SCROLLPOSITIONY: '0',
    __ASYNCPOST: 'true',
    ...extraFields,
  };
  if (session.eventValidation) {
    formData.__EVENTVALIDATION = session.eventValidation;
  }
  const body = new URLSearchParams(formData).toString();

  const resp = await fetch(postUrl, {
    method: 'POST',
    headers: { ...buildHeaders(session.cookies, true), Referer: postUrl },
    body,
  });
  if (!resp.ok) throw new Error(`catalog post failed: ${resp.status}`);

  const respBody = await resp.text();
  const newCookies = mergeCookies(session.cookies, getSetCookieArr(resp));

  if (respBody.includes('pageRedirect') && respBody.includes('login.aspx')) {
    throw new Error('SESSION_STALE');
  }

  const upMatch = /\|updatePanel\|[^|]+\|([\s\S]+?)(?:\|hiddenField\||\|asyncPostBackControlIDs\||$)/.exec(respBody);
  const innerHtml = upMatch ? upMatch[1] : respBody;

  const newViewState = extractViewStateFromUpdatePanel(respBody);
  const newEventValidation = extractEventValidationFromUpdatePanel(respBody);
  await setSession('preference', {
    ...session,
    cookies: newCookies,
    lastActivity: Date.now(),
    ...(newViewState ? { viewState: newViewState } : {}),
    ...(newEventValidation !== null
      ? { eventValidation: newEventValidation }
      : {}),
  });

  return innerHtml;
}

/**
 * Parse page 1 (already in `pageHtml`) + walk Préf's CtrlArtPager1 pager and parse
 * pages 2..N, deduped by (brand, ref). Préf paginates at 10 rows/page; without this
 * walk plate-search captures only the first 10 rows per category (we observed FIAT
 * PUNTO EVO had 3 pages of plaquettes and 2 of disques — ~30+10+20 ≈ 50 real rows,
 * we used to see 20). Mirrors `searchByRef`'s pager loop. Cap 10 pages for safety.
 */
async function parseListWithPagination(
  pageHtml: string,
  productType: ProductType | 'auto'
): Promise<BrakePartResult[]> {
  const page1 = parseProductList(pageHtml, productType);
  const out: BrakePartResult[] = [...page1];
  const seen = new Set(
    page1.map((p) => `${p.brand.trim().toUpperCase()}|${p.reference.trim().toUpperCase()}`)
  );
  const pagerCtls = parsePagerCtls(pageHtml).slice(0, 10);
  for (const pgCtl of pagerCtls) {
    const pgTarget = `${ART_PAGER_PREFIX}$${pgCtl}$LinkButton1`;
    try {
      const pgHtml = await postCatalogUpdatePanel(pgTarget);
      const pgParts = parseProductList(pgHtml, productType);
      let added = 0;
      for (const p of pgParts) {
        const key = `${p.brand.trim().toUpperCase()}|${p.reference.trim().toUpperCase()}`;
        if (seen.has(key) || !p.brand || !p.reference) continue;
        seen.add(key);
        out.push(p);
        added++;
      }
      console.info(
        `[preference] parseListWithPagination: ${pgCtl} → ${pgParts.length} parts (+${added} unique)`
      );
      if (pgParts.length === 0) break;
    } catch (e) {
      console.warn(
        `[preference] parseListWithPagination: pager ${pgCtl} failed:`,
        e instanceof Error ? e.message : e
      );
      break;
    }
  }
  return out;
}

async function clickCategoryAndParse(
  eventTarget: string,
  _vehicle: VehicleInfo,
  productType: ProductType
): Promise<BrakePartResult[]> {
  const innerHtml = await postCatalogUpdatePanel(eventTarget);
  return parseListWithPagination(innerHtml, productType);
}

async function loginStep(): Promise<{
  cookies: string;
  viewState: string;
  viewStateGenerator: string;
}> {
  const username = process.env.PREFERENCE_USERNAME;
  const password = process.env.PREFERENCE_PASSWORD;
  if (!username || !password) {
    throw new Error('PREFERENCE_USERNAME / PREFERENCE_PASSWORD missing in .env.local');
  }

  const step0 = await fetch(LOGIN_URL, {
    headers: { 'User-Agent': DEFAULT_UA },
  });
  if (!step0.ok) throw new Error(`step0 failed: ${step0.status}`);

  const initialCookies = mergeCookies('', getSetCookieArr(step0));
  const loginHtml = await step0.text();
  const fields0 = extractAspNetFields(loginHtml);
  if (!fields0.viewState) throw new Error('login.aspx: __VIEWSTATE not found');

  const formData: Record<string, string> = {
    'ctl00$ScriptManager1':
      'ctl00$ContentPlaceHolder1$UpdatePanel1|ctl00$ContentPlaceHolder1$CtrlLogin1$cmdvalider2',
    __EVENTTARGET: 'ctl00$ContentPlaceHolder1$CtrlLogin1$cmdvalider2',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    __VIEWSTATE: fields0.viewState,
    __VIEWSTATEGENERATOR: fields0.viewStateGenerator,
    __EVENTVALIDATION: fields0.eventValidation,
    __SCROLLPOSITIONX: '0',
    __SCROLLPOSITIONY: '0',
    'ctl00$ContentPlaceHolder1$CtrlLogin1$UserName': username,
    'ctl00$ContentPlaceHolder1$CtrlLogin1$Password': password,
    __ASYNCPOST: 'true',
  };
  const body = new URLSearchParams(formData).toString();

  const step1 = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { ...buildHeaders(initialCookies, true), Referer: LOGIN_URL },
    body,
  });
  if (!step1.ok) throw new Error(`step1 failed: ${step1.status}`);

  const step1Body = await step1.text();
  const step1Cookies = mergeCookies(initialCookies, getSetCookieArr(step1));

  const redirect = extractPageRedirect(step1Body);
  if (!redirect) {
    throw new Error(
      `INVALID_CREDENTIALS: no pageRedirect in response. body=${step1Body.slice(0, 200)}`
    );
  }
  if (redirect.includes('/login.aspx')) {
    throw new Error('INVALID_CREDENTIALS: redirect back to login');
  }

  const step2 = await fetch(`${PREFERENCE_BASE}${redirect}`, {
    headers: { ...buildHeaders(step1Cookies, false), Referer: LOGIN_URL },
    redirect: 'follow',
  });
  if (!step2.ok) throw new Error(`step2 failed: ${step2.status}`);

  const homeHtml = await step2.text();
  const finalCookies = mergeCookies(step1Cookies, getSetCookieArr(step2));
  const homeFields = extractAspNetFields(homeHtml);

  return {
    cookies: finalCookies,
    viewState: homeFields.viewState,
    viewStateGenerator: homeFields.viewStateGenerator,
  };
}

export async function login(): Promise<void> {
  const result = await loginStep();
  await setSession('preference', {
    supplier: 'preference',
    cookies: result.cookies,
    viewState: result.viewState,
    viewStateGenerator: result.viewStateGenerator,
    loggedInAt: Date.now(),
    lastActivity: Date.now(),
    userAgent: DEFAULT_UA,
  });
}

export async function searchByPlate(
  plate: string,
  category: ProductType = 'plaquette'
): Promise<{
  vehicle: VehicleInfo;
  parts: BrakePartResult[];
}> {
  const startTime = Date.now();
  logger.info('B2B Plate lookup process initiated', { supplier: 'preference', action: 'searchByPlate', plate, category });

  const active = await getSession('preference');
  if (!active || (await isExpired(active))) {
    logger.info('Préférence session missing or expired — triggering re-login', { supplier: 'preference', action: 'login', plate });
    await login();
  } else {
    logger.info('Préférence active session reused from cache', { supplier: 'preference', action: 'session_reuse', plate });
  }

  let redirect: string;
  try {
    const stepStart = Date.now();
    redirect = await plateSearchStep(plate);
    logger.info('Plate identification step completed', { supplier: 'preference', action: 'plateSearchStep', plate, durationMs: Date.now() - stepStart });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'SESSION_STALE') {
      logger.warn('Session invalidated during search — retrying with fresh login', { supplier: 'preference', action: 'session_retry', plate });
      await login();
      redirect = await plateSearchStep(plate);
    } else {
      throw e;
    }
  }

  let { vehicle, html } = await fetchHomeAndParseVehicle(redirect);
  logger.info('Vehicle record resolved', { supplier: 'preference', action: 'parseVehicle', plate, carId: vehicle.carId, brand: vehicle.brand, model: vehicle.model });

  const findBrakePadTarget = (pageHtml: string): string | null => {
    const doc = stripScriptAndStyleTags(pageHtml);
    const keywords =
      category === 'disque'
        ? ['disque de frein', 'disques de frein', 'disque', 'disques']
        : [
            'plaquettes de frein',
            'kit de plaquettes',
            'plaquette de frein',
            'plaquettes',
            'plaquette',
          ];
    for (const kw of keywords) {
      const t = findCategoryEventTarget(doc, kw);
      if (t) return t;
    }
    const fallbacks =
      category === 'disque' ? ['disque de frein', 'disque'] : ['plaquette', 'plaquettes de frein'];
    for (const kw of fallbacks) {
      const t = findPostBackTargetNearKeyword(doc, kw);
      if (t) return t;
    }
    return null;
  };

  const loadParts = async (): Promise<BrakePartResult[]> => {
    const cmdFired = `${AC_ART_GEN_PREFIX}$cmdFired`;

    const tryPartsFromHtml = async (pageHtml: string): Promise<BrakePartResult[] | null> => {
      let t = findBrakePadTarget(pageHtml);
      if (t) return clickCategoryAndParse(t, vehicle, category);
      const dg = findBrakePadDatagrpKeys(pageHtml, category);
      if (dg) {
        const inner = await postCatalogUpdatePanel(cmdFired, {
          [`${AC_ART_GEN_PREFIX}$HiddenGrpValue`]: dg.keycat,
          [`${AC_ART_GEN_PREFIX}$HiddenValue`]: dg.key,
        });
        const fromList = await parseListWithPagination(inner, category);
        if (fromList.length) return fromList;
        t = findBrakePadTarget(inner);
        if (t) return clickCategoryAndParse(t, vehicle, category);
      }
      return null;
    };

    let parts = await tryPartsFromHtml(html);
    if (parts) return parts;

    const doc = stripScriptAndStyleTags(html);
    const freinage =
      findCategoryEventTarget(doc, 'freinage') ||
      findPostBackTargetNearKeyword(doc, 'freinage');
    if (!freinage) {
      throw new Error('NO_PRODUCTS: brake pad category not found in page');
    }
    const innerAfterFreinage = await postCatalogUpdatePanel(freinage);
    parts = await tryPartsFromHtml(innerAfterFreinage);
    if (parts) return parts;

    throw new Error('NO_PRODUCTS: brake pad category not found in page');
  };

  let parts: BrakePartResult[];
  try {
    parts = await loadParts();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'SESSION_STALE') {
      await login();
      redirect = await plateSearchStep(plate);
      const r = await fetchHomeAndParseVehicle(redirect);
      vehicle = r.vehicle;
      html = r.html;
      parts = await loadParts();
    } else {
      throw e;
    }
  }

  const totalDurationMs = Date.now() - startTime;
  logger.info('B2B Plate lookup completed successfully', {
    supplier: 'preference',
    action: 'searchByPlate_complete',
    plate,
    brand: vehicle.brand,
    partsFound: parts.length,
    durationMs: totalDurationMs,
  });

  return { vehicle, parts };
}

/**
 * 反查: Préférence 按货号搜索, 返回该 ref + 跨品牌等价品.
 * 端点: POST /catalogue/1-pieces-auto.aspx, EVENTTARGET=CtrlSearchArtByRef1$cmdSearByRef.
 * 不依赖车牌, 但需要已登录 session + 有效 VIEWSTATE (catalog page 已访问过).
 * Response HTML 结构 = 标准 articleTemplateSelection 表, 直接复用 parseProductList.
 */
// REF_PREFIX path = the search-by-ref AutoComplete control on the catalog page
const REF_PREFIX =
  'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlSearchArtByRef1';
const REF_AC = `${REF_PREFIX}$CtrlAutoComplete1`;
const ASM_GRID_PREFIX = 'ctl00$ContentPlaceHolderLeft$CtrlSelectAssemblysCataS60001$GridView1';
const ART_PAGER_PREFIX = 'ctl00$ContentPlaceHolder1$CtrlArtPager1$repeater1';

/** Build the full form-field set for a Préférence catalog postback. The new ref-search
 *  UI (cmdFired + cmdSelect) requires 22+ supplementary hidden fields beyond the minimal
 *  __VIEWSTATE / __EVENTTARGET pair — captured verbatim from 2127.saz sid=12/13. */
function buildCatalogPostbackFields(opts: {
  scriptManagerArg: string;
  eventTarget: string;
  viewState: string;
  viewStateGenerator: string;
  hiddenSession: string;
  txtRef?: string;
  eventValidation?: string;
  /** Extra fields to merge — e.g. `${REF_AC}$cmdFired: ''` when the cmdFired
   *  button is the trigger. ASP.NET WebForms requires the trigger control's name to
   *  be present as a form field (even empty) for the postback to be recognized. */
  extra?: Record<string, string>;
}): Record<string, string> {
  const fields: Record<string, string> = {
    ctl00$ScriptManager1: opts.scriptManagerArg,
    __EVENTTARGET: opts.eventTarget,
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    __SCROLLPOSITIONX: '0',
    __SCROLLPOSITIONY: '0',
    __VIEWSTATE: opts.viewState,
    __VIEWSTATEGENERATOR: opts.viewStateGenerator,
    __ASYNCPOST: 'true',
    ctl00$ContentPlaceHolder1$CtrlStockPartner1$hiddenRequest: '',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$ctrlButtonsTemplatesSelector1$ctl00$CtrlImportArticles1$DropDownListTypImport':
      '1',
    [`${REF_PREFIX}$ListSearchExtender1_ClientState`]: '',
    [`${REF_AC}$txtRef`]: opts.txtRef ?? '',
    [`${REF_AC}$HiddenMarque`]: '',
    [`${REF_AC}$HiddenValue`]: '',
    [`${REF_AC}$HiddenSession`]: opts.hiddenSession,
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$txtTypeMine':
      '',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlVehiSelectorByModel1$drpMarques':
      '0',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlVehiSelectorByModel1$drpModels':
      '0',
    'ctl00$ContentPlaceHolder1$CtrlCatalogueTecdocV3$CtrlSearchVehiculesTemplateSelector1$ctl00$CtrlVehiSelectorByModel1$drpVehiculs':
      '0',
    'ctl00$ContentPlaceHolder1$CtrlInfiniteScroll1$hiddenIsLoading': '',
    'ctl00$ContentPlaceHolder1$CtrlInfiniteScroll1$hiddenActif': '',
  };
  if (opts.eventValidation) fields.__EVENTVALIDATION = opts.eventValidation;
  if (opts.extra) Object.assign(fields, opts.extra);
  return fields;
}

/** POST a catalog page form with full ScriptManager1 control. Returns response body
 *  + persisted updated session (cookies/viewState). Caller is responsible for parsing. */
async function postCatalogForm(opts: {
  scriptManagerArg: string;
  eventTarget: string;
  txtRef?: string;
  hiddenSession: string;
  /** Extra form fields (e.g. `${REF_AC}$cmdFired: ''` for cmdFired postbacks) */
  extra?: Record<string, string>;
}): Promise<string> {
  const session = await getSession('preference');
  if (!session) throw new Error('SESSION_STALE');
  const postUrl = session.cataloguePageUrl ?? CATALOG_URL;

  const fields = buildCatalogPostbackFields({
    scriptManagerArg: opts.scriptManagerArg,
    eventTarget: opts.eventTarget,
    viewState: session.viewState ?? '',
    viewStateGenerator: session.viewStateGenerator ?? '',
    hiddenSession: opts.hiddenSession,
    txtRef: opts.txtRef,
    eventValidation: session.eventValidation,
    extra: opts.extra,
  });
  const body = new URLSearchParams(fields).toString();

  const resp = await fetch(postUrl, {
    method: 'POST',
    headers: { ...buildHeaders(session.cookies, true), Referer: postUrl },
    body,
  });
  if (!resp.ok) throw new Error(`catalog post failed: ${resp.status}`);
  const respBody = await resp.text();
  if (respBody.includes('pageRedirect') && respBody.includes('login.aspx')) {
    throw new Error('SESSION_STALE');
  }

  const newViewState = extractViewStateFromUpdatePanel(respBody);
  const newEventValidation = extractEventValidationFromUpdatePanel(respBody);
  await setSession('preference', {
    ...session,
    cookies: mergeCookies(session.cookies, getSetCookieArr(resp)),
    lastActivity: Date.now(),
    ...(newViewState ? { viewState: newViewState } : {}),
    ...(newEventValidation !== null ? { eventValidation: newEventValidation } : {}),
  });
  return respBody;
}

/** Parse the assembly-group selection GridView from the cmdFired response.
 *  Returns one entry per row: { ctlIndex: 'ctl02', artgenid: '8418', label: 'Kit de plaquettes...' }.
 *  The ctlIndex is what goes into the cmdSelect EVENTTARGET. */
function parseAssemblyGroups(html: string): Array<{
  ctlIndex: string;
  artgenid: string;
  label: string;
  brands: string;
}> {
  const out: Array<{ ctlIndex: string; artgenid: string; label: string; brands: string }> = [];
  const seen = new Set<string>();
  // Match each <a> with GridView1_ctlNN_cmdSelect carrying artgenid + neighboring labels.
  const rowRe =
    /GridView1_(ctl\d+)_cmdSelect[^>]*?artgenid="(\d+)"[\s\S]*?GridView1_\1_Label1[^>]*>([^<]+)<[\s\S]*?GridView1_\1_Label2[^>]*>([^<]+)</g;
  for (const m of html.matchAll(rowRe)) {
    const ctlIndex = m[1]!;
    const artgenid = m[2]!;
    if (seen.has(ctlIndex)) continue;
    seen.add(ctlIndex);
    out.push({
      ctlIndex,
      artgenid,
      label: m[3]!.trim(),
      brands: m[4]!.trim(),
    });
  }
  return out;
}

/** Parse pagination link targets from an article-list response. Returns the ordered list
 *  of ctlNN identifiers for pages OTHER than the currently-displayed one (which is rendered
 *  as a disabled <a>). The current page link has `disabled="disabled"` — skip it. */
function parsePagerCtls(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /CtrlArtPager1_repeater1_(ctl\d+)_LinkButton1"([^>]*)>/g;
  for (const m of html.matchAll(re)) {
    const ctl = m[1]!;
    const attrs = m[2]!;
    if (seen.has(ctl)) continue;
    seen.add(ctl);
    // skip the disabled (current) page
    if (/disabled="disabled"/i.test(attrs)) continue;
    out.push(ctl);
  }
  return out;
}

/** New 2-step ref-search flow (matches 2127.saz protocol).
 *  Old endpoint $cmdSearByRef was deprecated when Préférence migrated to the autocomplete
 *  UI. New flow:
 *    1) refresh catalog landing → fresh VIEWSTATE
 *    2) POST cmdFired (autocomplete-driven search) → assembly-group selection modal HTML
 *    3) for each assembly row, POST cmdSelect → article list (paginated)
 *    4) for each subsequent page, POST CtrlArtPager1 LinkButton → more articles
 *  Dedup across assemblies + pages by (brand, reference).
 */
export async function searchByRef(ref: string): Promise<BrakePartResult[]> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('REF_EMPTY');

  const active = await getSession('preference');
  if (!active || (await isExpired(active))) {
    console.info('[preference] searchByRef: calling login() (session missing/expired)');
    await login();
  }

  // STEP 1 — refresh catalog landing to capture a clean VIEWSTATE + idsession.
  // The page embeds a server-generated `idsession` UUID (in the autocomplete JS init)
  // that MUST be sent back as HiddenSession for cmdFired to be recognised. Generating
  // our own UUID server-side returns an empty GridView ("server doesn't know this session").
  // Retry-with-login: cookies sometimes degrade silently (`isExpired` doesn't catch it).
  // If first GET doesn't yield idsession, force fresh login and retry once.
  let landingHtml = '';
  let landing: Response | null = null;
  let fields: ReturnType<typeof extractAspNetFields> | null = null;
  let idSessionMatch: RegExpExecArray | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const fresh = await getSession('preference');
    if (!fresh) throw new Error('SESSION_STALE');
    landing = await fetch(CATALOG_URL, {
      headers: { ...buildHeaders(fresh.cookies, false), Referer: PREFERENCE_BASE },
      redirect: 'follow',
    });
    if (!landing.ok) throw new Error(`catalog GET failed: ${landing.status}`);
    landingHtml = await landing.text();
    fields = extractAspNetFields(landingHtml);
    idSessionMatch = /idsession\s*:\s*"([0-9a-fA-F-]{36})"/.exec(landingHtml);
    if (idSessionMatch) break;
    if (attempt === 0) {
      console.info(
        '[preference] searchByRef: landing missing idsession (session degraded) — forcing fresh login + retry'
      );
      await login();
    }
  }
  if (!idSessionMatch) {
    throw new Error('searchByRef: idsession UUID not found in catalog landing page (post-relogin)');
  }
  if (!landing || !fields) throw new Error('searchByRef: internal — landing context lost');
  const hiddenSession = idSessionMatch[1]!;
  const privatePwdMatch = /privatepwd\s*:\s*"([^"]+)"/.exec(landingHtml);
  const succMatch = /succ\s*:\s*"([^"]+)"/.exec(landingHtml);
  const ifaceMatch = /interface\s*:\s*"([^"]+)"/.exec(landingHtml);
  const modeMatch = /mode\s*:\s*"([^"]+)"/.exec(landingHtml);
  const acPrivatePwd = privatePwdMatch?.[1] ?? '';
  const acSucc = succMatch?.[1] ?? '01';
  const acIface = ifaceMatch?.[1] ?? 'CYB';
  const acMode = modeMatch?.[1] ?? 'RefWithCat';
  console.info(
    `[preference] searchByRef: idsession=${hiddenSession} succ=${acSucc} mode=${acMode} pp=${acPrivatePwd ? acPrivatePwd.slice(0, 6) + '...' : '<none>'}`
  );

  const sessionToUpdate = await getSession('preference');
  if (!sessionToUpdate) throw new Error('SESSION_STALE');
  await setSession('preference', {
    ...sessionToUpdate,
    cookies: mergeCookies(sessionToUpdate.cookies, getSetCookieArr(landing)),
    cataloguePageUrl: CATALOG_URL,
    viewState: fields.viewState,
    viewStateGenerator: fields.viewStateGenerator,
    eventValidation: fields.eventValidation,
    lastActivity: Date.now(),
  });

  const refLc = trimmed.toLowerCase(); // SAZ shows the input is sent lowercase

  // STEP 1.5 — register the idsession+search server-side via CallWS.aspx (autocomplete).
  // Without this, cmdFired returns an empty assembly grid because the server has no
  // recorded search state for this idsession. SAZ shows the UI calls this on every
  // keystroke; we replicate with one call carrying the full ref.
  const sessionForAc = await getSession('preference');
  if (sessionForAc && acPrivatePwd) {
    const acUrl =
      `${PREFERENCE_BASE}/CallWS.aspx?origine=autocomplete` +
      `&callback=jQuery_${Date.now()}` +
      `&featureClass=P&style=full&limit=20` +
      `&name_startsWith=${encodeURIComponent(refLc)}` +
      `&idsession=${hiddenSession}` +
      `&succ=${encodeURIComponent(acSucc)}` +
      `&privatepwd=${encodeURIComponent(acPrivatePwd)}` +
      `&interface=${encodeURIComponent(acIface)}` +
      `&mode=${encodeURIComponent(acMode)}` +
      `&cattag=&_=${Date.now()}`;
    try {
      const acResp = await fetch(acUrl, {
        method: 'GET',
        headers: {
          ...buildHeaders(sessionForAc.cookies, false),
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'text/javascript, application/javascript, application/ecmascript, */*; q=0.01',
          Referer: CATALOG_URL,
        },
      });
      const acText = await acResp.text();
      console.info(
        `[preference] searchByRef: autocomplete pre-register status=${acResp.status} bytes=${acText.length}`
      );
    } catch (e) {
      console.warn('[preference] searchByRef: autocomplete pre-register failed:', e);
      // continue anyway — cmdFired may still work
    }
  } else if (!acPrivatePwd) {
    console.warn('[preference] searchByRef: privatepwd not found, skipping autocomplete pre-register');
  }

  const runRef = async (): Promise<BrakePartResult[]> => {
    // STEP 2 — cmdFired postback → assembly-group selection modal HTML.
    // CRITICAL: include `${REF_AC}$cmdFired: ''` in the form body — ASP.NET WebForms
    // identifies the postback trigger by this field's presence. Missing it makes the
    // server treat the request as a generic postback and return an empty modal.
    const cmdFiredResp = await postCatalogForm({
      scriptManagerArg: `${REF_PREFIX}$UpdatePanel1|${REF_AC}$cmdFired`,
      eventTarget: '',
      txtRef: refLc,
      hiddenSession,
      extra: { [`${REF_AC}$cmdFired`]: '' },
    });
    const assemblies = parseAssemblyGroups(cmdFiredResp);
    if (assemblies.length === 0) {
      console.info(
        `[preference] searchByRef("${trimmed}"): cmdFired returned 0 assembly groups (ref likely not in Préférence catalog)`
      );
      return [];
    }
    console.info(
      `[preference] searchByRef("${trimmed}"): ${assemblies.length} assembly group(s) — ${assemblies.map((a) => `${a.label} [${a.artgenid}]`).join(' | ')}`
    );

    // STEP 3 — for each assembly group, cmdSelect → article list + paginate
    const all: BrakePartResult[] = [];
    const seenKeys = new Set<string>();
    const pushParts = (parts: BrakePartResult[]): number => {
      let added = 0;
      for (const p of parts) {
        const key = `${p.brand.trim().toUpperCase()}|${p.reference.trim().toUpperCase()}`;
        if (seenKeys.has(key) || !p.brand || !p.reference) continue;
        seenKeys.add(key);
        all.push(p);
        added++;
      }
      return added;
    };

    for (const ag of assemblies) {
      const selectTarget = `${ASM_GRID_PREFIX}$${ag.ctlIndex}$cmdSelect`;
      const articleHtml = await postCatalogForm({
        scriptManagerArg: `ctl00$ContentPlaceHolderLeft$updatepan|${selectTarget}`,
        eventTarget: selectTarget,
        hiddenSession,
      });
      const page1 = parseProductList(articleHtml, 'auto');
      const added1 = pushParts(page1);
      console.info(
        `[preference] searchByRef: assembly ${ag.label} [${ag.artgenid}] page1=${page1.length} (+${added1} unique)`
      );

      // Pagination — follow LinkButton ctls (other than the current page) in order.
      // Cap at 10 pages per assembly for safety.
      const pagerCtls = parsePagerCtls(articleHtml).slice(0, 10);
      for (const pgCtl of pagerCtls) {
        const pgTarget = `${ART_PAGER_PREFIX}$${pgCtl}$LinkButton1`;
        const pgResp = await postCatalogForm({
          scriptManagerArg: `ctl00$ContentPlaceHolder1$UpdatePanel3|${pgTarget}`,
          eventTarget: pgTarget,
          hiddenSession,
        });
        const pgParts = parseProductList(pgResp, 'auto');
        const addedN = pushParts(pgParts);
        console.info(
          `[preference] searchByRef: assembly ${ag.artgenid} ${pgCtl} → ${pgParts.length} parts (+${addedN} unique)`
        );
        if (pgParts.length === 0) break;
      }
    }

    console.info(
      `[preference] searchByRef("${trimmed}") → ${all.length} unique parts across ${assemblies.length} assembly group(s)`
    );
    return all;
  };

  try {
    return await runRef();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'SESSION_STALE') {
      await login();
      return await runRef();
    }
    throw e;
  }
}

/**
 * Single-step ref-search (matches 2020.saz protocol — current UI uses this when
 * the user types a ref + presses the "Recherche" button, instead of clicking an
 * autocomplete suggestion). The earlier note that `$cmdSearByRef` was
 * "deprecated" turned out to be wrong: the autocomplete-driven `cmdFired` only
 * works for refs Préférence's autocomplete indexes (TRW/BREMBO/BOSCH);
 * private-label / less-popular SKUs (FAHREN FBxxxx, ETF EBxxxx) only respond
 * to `cmdSearByRef`. SAZ session 8 verbatim:
 *   EVENTTARGET = REF_PREFIX$cmdSearByRef
 *   ScriptManagerArg = REF_PREFIX$UpdatePanel1|REF_PREFIX$cmdSearByRef
 *   txtRef = <original case>
 *   no cmdFired field
 *
 * Response body: standard articleTemplateSelection rows (5-N depending on
 * coverage), parsed straight by parseProductList (no assembly-group modal
 * intermediary).
 */
export async function searchByRefV2(ref: string): Promise<BrakePartResult[]> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('REF_EMPTY');

  const active = await getSession('preference');
  if (!active || (await isExpired(active))) {
    console.info('[preference] searchByRefV2: calling login()');
    await login();
  }

  // Step 1 — refresh catalog landing (capture VIEWSTATE + idsession)
  let landingHtml = '';
  let landing: Response | null = null;
  let fields: ReturnType<typeof extractAspNetFields> | null = null;
  let idSessionMatch: RegExpExecArray | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const fresh = await getSession('preference');
    if (!fresh) throw new Error('SESSION_STALE');
    landing = await fetch(CATALOG_URL, {
      headers: { ...buildHeaders(fresh.cookies, false), Referer: PREFERENCE_BASE },
      redirect: 'follow',
    });
    if (!landing.ok) throw new Error(`catalog GET failed: ${landing.status}`);
    landingHtml = await landing.text();
    fields = extractAspNetFields(landingHtml);
    idSessionMatch = /idsession\s*:\s*"([0-9a-fA-F-]{36})"/.exec(landingHtml);
    if (idSessionMatch) break;
    if (attempt === 0) {
      console.info('[preference] searchByRefV2: idsession missing → relogin retry');
      await login();
    }
  }
  if (!idSessionMatch || !landing || !fields) {
    throw new Error('searchByRefV2: idsession UUID not found in catalog landing');
  }
  const hiddenSession = idSessionMatch[1]!;

  // Persist fresh viewstate before the search POST
  const sessionToUpdate = await getSession('preference');
  if (!sessionToUpdate) throw new Error('SESSION_STALE');
  await setSession('preference', {
    ...sessionToUpdate,
    cookies: mergeCookies(sessionToUpdate.cookies, getSetCookieArr(landing)),
    cataloguePageUrl: CATALOG_URL,
    viewState: fields.viewState,
    viewStateGenerator: fields.viewStateGenerator,
    eventValidation: fields.eventValidation,
    lastActivity: Date.now(),
  });

  // Step 2 — single POST: cmdSearByRef → article list directly
  const searTarget = `${REF_PREFIX}$cmdSearByRef`;
  const runOnce = async (): Promise<BrakePartResult[]> => {
    const respBody = await postCatalogForm({
      scriptManagerArg: `${REF_PREFIX}$UpdatePanel1|${searTarget}`,
      eventTarget: searTarget,
      txtRef: trimmed, // preserve original case
      hiddenSession,
    });
    return parseProductList(respBody, 'auto');
  };

  try {
    return await runOnce();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'SESSION_STALE') {
      await login();
      return await runOnce();
    }
    throw e;
  }
}

export async function getStatus(): Promise<{
  loggedIn: boolean;
  lastActivity?: number;
  expiresAt?: number;
}> {
  const s = await getSession('preference');
  if (!s) {
    return { loggedIn: false };
  }
  const expired = await isExpired(s);
  return {
    loggedIn: !expired,
    lastActivity: s.lastActivity,
    expiresAt: getSessionExpiresAt(s),
  };
}
