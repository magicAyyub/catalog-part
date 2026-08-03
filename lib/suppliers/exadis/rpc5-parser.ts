/**
 * Exadis RPC #5 (searchArticleByVehicule) 响应解析器.
 * 将字符串表转为产品列表，供 RPC #6 与展示 join.
 *
 * 算法 (基于 EZ494ZA / BJ060PA / CG534WF / FR174AL 四车 dump 归纳):
 *   1) 4-digit 0NNN 是 TecDoc supplier_id 零填充 (0062=FERODO, 0065=BREMBO 等).
 *      每个 code 唯一锁定一个 "header" 文章 (距离最近 articleId).
 *   2) "header" 之后跟着的 articleId (无自己 0NNN) 是同品牌的 "compact follower",
 *      通过继承 currentBrand 解决.
 *   3) ATE 不发 0NNN code, 但其段内会出现独立大写 TEVES 标记 → 用它锁定 ATE.
 *   4) ref 用品牌特征前缀正则 (FDB/GDB/05P/P NN NNN/ADB/DDF) 在 articleId 周围
 *      ±5 token 窗口里找; FEBI 是 5-6 位纯数字, 限定在 +1 位置.
 */

import { extractAxleByArticle, type AxleSide } from './axle-parser';
import type { ProductCategory } from '../base';

export interface Rpc5Product {
  articleId: string;
  stockId: string;
  brand: string;
  reference: string;
  axle: AxleSide | null;
  productType: ProductCategory;
}

// TecDoc supplier_id (零填充 4 位) → 品牌显示名
const SUPPLIER_CODE_TO_BRAND: Record<string, string> = {
  '0003': 'ATE',
  '0021': 'VALEO',
  '0030': 'BOSCH',
  '0039': 'TEXTAR',
  '0062': 'FERODO (FEDERAL MOGUL)',
  '0065': 'BREMBO',
  '0073': 'MINTEX',
  '0089': 'DELPHI',
  '0101': 'FEBI BILSTEIN',
  '0127': 'NK',
  '0161': 'TRW',
  '0197': 'LPR GROUP',
  '0350': 'BLUE PRINT',
};

// "强" 品牌文本 token — 在表里看到时无歧义代表该品牌.
// 排除 "ATE"/"TRW" 单独词 — 它们会作为兼容性说明 (e.g. "适配 ATE 系统") 出现在别家产品段里.
const STRONG_BRAND_TEXT: Record<string, string> = {
  BREMBO: 'BREMBO',
  TEVES: 'ATE',
  'LPR GROUP': 'LPR GROUP',
  'FEBI BILSTEIN': 'FEBI BILSTEIN',
  'FERODO (FEDERAL MOGUL)': 'FERODO (FEDERAL MOGUL)',
  'BLUE PRINT': 'BLUE PRINT',
  TEXTAR: 'TEXTAR',
  VALEO: 'VALEO',
  BOSCH: 'BOSCH',
  MINTEX: 'MINTEX',
  DELPHI: 'DELPHI',
  FAHREN: 'FAHREN',
};

// articleId: Exadis 主表的 article 主键.
//   - 7 位数字 (TRW/LPR/BLUE PRINT/BREMBO/BOSCH/FEBI 等大多数品牌): 1005325, 1396186, 1451405
//   - 6 位 4开头 (FERODO PREMIER ECO FRICTION 历史货号): 436188, 436330, 436241
//   - 排除 stockId (8 位 81 开头)
// 之前 /^\d{6,7}$/ 太宽 — FEBI TecDoc 外部码 116026/116045 也是 6 位 (1开头), 会被误识别成
// "compact follower" articleId, 后续抓 ref 跑到隔壁品牌段去. 收紧到 7 位 + FERODO 4xxxxx.
const isArticleId = (s: string): boolean => {
  if (/^4\d{5}$/.test(s)) return true; // FERODO 6 位
  if (!/^\d{7}$/.test(s)) return false;
  if (/^81\d{5,}$/.test(s)) return false; // stockId (81NNN...)
  return true;
};
const isStockId = (s: string): boolean => /^81\d{8}$/.test(s);
const isKnownSupplierCode = (s: string): boolean =>
  Object.prototype.hasOwnProperty.call(SUPPLIER_CODE_TO_BRAND, s);

// Brand-aware strong patterns — 每个 brand 只接受自家货号格式, 避免跨品牌段污染
// (e.g. FEBI 段里出现的 D894-7773 是 BLUE PRINT 的 OE 交叉号, 不能被当成 FEBI 的 ref).
const BRAND_STRONG_PATTERNS: Record<string, readonly RegExp[]> = {
  TRW: [/^GDB\d+[A-Z]?$/i, /^DF\d+[A-Z]?$/i],
  'FERODO (FEDERAL MOGUL)': [
    /^FDB\d+[A-Z]?$/i,
    /^FSB\d+[A-Z]?$/i,
    /^DDF\d+[A-Z]?(?:-\d+)?$/i,
  ],
  BREMBO: [
    /^P\s+\d{2}\s+\d{2,3}[A-Z]?$/,
    /^\d{2}\.[A-Z0-9]{4,5}\.\d+[A-Z0-9]*$/i,
  ],
  'BLUE PRINT': [
    /^AD[A-Z]+\d+$/i, // ADB / ADP / ADR / ADV / ADC ...
    /^D\d{3,4}-\d{4,5}$/, // D1017-7920 / D894-7773
  ],
  'LPR GROUP': [/^05P\d+[A-Z]?$/i, /^[BFR]\d{4}[A-Z]?$/i],
  // FEBI BILSTEIN: 用 "Référence additionnelle" 标签 + 5-6 位纯数字 ref, 无独立 strong 形状
  // BOSCH / VALEO: 复杂多格式, 暂归通用 looksLikeRef 处理
};

function matchesBrandPattern(s: string, brand: string): boolean {
  const patterns = BRAND_STRONG_PATTERNS[brand];
  if (!patterns) return false;
  return patterns.some((p) => p.test(s));
}

// 通用 "看起来像 ref" 兜底: 排除所有明确非 ref 的字段后, 剩下的 SKU 形.
function looksLikeRef(s: string): boolean {
  if (!s || s.length < 4 || s.length > 24) return false;
  // 文件/类标识
  if (/\.gif$/i.test(s)) return false;
  if (/^java\./i.test(s) || /^com\./i.test(s)) return false;
  // 已知 ID 类型
  if (isStockId(s)) return false;
  if (isArticleId(s)) return false;
  if (isKnownSupplierCode(s)) return false;
  if (/^0\d{3}$/.test(s)) return false; // 任何 0NNN 零填充码
  // 品牌名 / 类目标签
  if (STRONG_BRAND_TEXT[s]) return false;
  // 计量单位标签
  if (/\[(?:mm|kg|g|Nm|N|h)\]/i.test(s)) return false;
  if (/^pour\s+num[ée]ro/i.test(s)) return false;
  // 认证 / 标识词 (ECE R90, ECE-R90, E9 90R-..., E1 90 R-..., Approved 等)
  if (/^ECE[\s-]?R?\d{2,3}\b/i.test(s)) return false;
  if (/^[A-Z]{2,5}-R\d{1,3}$/i.test(s)) return false;
  if (/\bApproved\b/i.test(s)) return false;
  if (/^E\d{1,2}\s+\d{2,3}\s*R\b/i.test(s)) return false; // "E9 90R - ...", "E1 90 R -..."
  if (/^E\d{1,2}-R\d/i.test(s)) return false;
  // 法语描述句 (含空格 + 首字母大写 + 至少 2 词)
  if (/^[A-ZÀ-Ÿ][a-zà-ÿé]+\s+[a-zà-ÿé]/.test(s)) return false;
  // 全短大写 2-3 字符 (NS/WW/RE/RF/EC 等标记)
  if (/^[A-Z]{2,3}$/.test(s)) return false;
  // 带逗号小数或百分数 (价格/重量/尺寸)
  if (/^-?\d+,\d+$/.test(s)) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    // 5-6 位纯数字保留 (FEBI 数字 ref)
    if (!/^\d{5,6}$/.test(s)) return false;
  }
  // 数字占位: 至少 3 位数字, 防止 "ECE-R90" (2 digits) / 短小标记被误判
  const digitCount = (s.match(/\d/g) ?? []).length;
  if (digitCount < 3) return false;
  // SKU 形: 字母+数字混合, 或纯 5-6 位数字, 或 BREMBO 空格格式
  const hasLetter = /[A-Za-z]/.test(s);
  const hasDigit = /\d/.test(s);
  if (hasLetter && hasDigit) return true;
  if (/^\d{5,6}$/.test(s)) return true;
  if (/^P\s+\d{2}\s+\d{2,3}[A-Z]?$/.test(s)) return true;
  return false;
}

// "Référence additionnelle" 紧跟的字符串是该品牌真正的 ref (FEBI 在 articleId=内码 时这么记).
// 注: 不能把 "Ancienne référence" (= 旧/历史货号) 也算进来 — BLUE PRINT 等会记历史码, 但当前 ref
// 在 articleId 紧后, 误用 Ancienne 会让 "16527" 顶掉 "ADV184243".
function isRefLabel(s: string): boolean {
  return /^R[ée]f[ée]rence\s+additionnelle$/i.test(s);
}

// "pour numéro OE" / "Numéro OE" 这种标签后紧跟的是车厂 OEM 号 (Ford 4M5G6N664BA 等),
// 不能被误当成本品牌 ref. 在 findRef 里跳过 (label@j → 排除 j+1).
function isOemLabel(s: string): boolean {
  return /^pour\s+num[ée]ro\s+(?:OE|OEM)\b/i.test(s) || /^num[ée]ro\s+OE\b/i.test(s);
}

/** 收集 OEM 标签紧后位置, 这些位置永远不应作为 brand ref. */
function buildOemMaskedPositions(table: readonly string[]): Set<number> {
  const out = new Set<number>();
  for (let j = 0; j < table.length - 1; j++) {
    if (isOemLabel(table[j] ?? '')) out.add(j + 1);
  }
  return out;
}

/**
 * 找 article 的 ref. 多策略级联, 由严格到兜底:
 *   1) "Référence (additionnelle)" 标签紧跟的值 (FEBI 等 articleId=内码 的品牌)
 *   2) STRONG_REF_PATTERNS 强匹配, 优先 [+1,+8] 再整段
 *   3) looksLikeRef 兜底: [+1,+4] 优先, 然后全段, 最后反向
 */
function findRef(
  table: string[],
  i: number,
  segLo: number,
  segHi: number,
  oemMasked: Set<number>,
  isVirtual: boolean,
  brand: string
): string {
  const ok = (j: number, s: string): boolean => !oemMasked.has(j) && looksLikeRef(s);
  const okBrand = (j: number, s: string): boolean =>
    !oemMasked.has(j) && matchesBrandPattern(s, brand);

  // 1) Label-anchored: "Référence additionnelle" + value (FEBI 用)
  for (let j = i + 1; j < segHi - 1; j++) {
    if (isRefLabel(table[j] ?? '')) {
      const v = table[j + 1] ?? '';
      if (ok(j + 1, v)) return v;
    }
  }

  // 2) Brand-aware strong-pattern 整段 forward 搜 — 只接受当前 brand 自家的 ref 格式,
  // 防止 FEBI 段内出现的 BLUE PRINT D894-7773 / BREMBO P NN NNN 等 OE 交叉号被误吞。
  for (let j = i + 1; j < segHi; j++) {
    if (okBrand(j, table[j] ?? '')) return table[j]!;
  }

  // 3) Generic looksLikeRef tight forward [+1, +4] — 通用兜底, 主要给 FEBI 等无 strong 形状的品牌
  for (let j = i + 1; j < Math.min(segHi, i + 5); j++) {
    if (ok(j, table[j] ?? '')) return table[j]!;
  }

  // 4) 整段 forward looksLikeRef — 最后兜底
  for (let j = i + 5; j < segHi; j++) {
    if (ok(j, table[j] ?? '')) return table[j]!;
  }

  // 5) Backward 仅 virtual article 启用 (LPR code 之前是 ref)
  if (isVirtual) {
    for (let j = i - 1; j >= segLo; j--) {
      if (okBrand(j, table[j] ?? '')) return table[j]!;
    }
    for (let j = i - 1; j >= segLo; j--) {
      if (ok(j, table[j] ?? '')) return table[j]!;
    }
  }
  return '';
}

function findStockId(table: string[], i: number, segLo: number): string {
  for (let j = i - 1; j >= Math.max(segLo, i - 15); j--) {
    const t = table[j] ?? '';
    if (isArticleId(t)) break;
    if (isStockId(t)) return t;
  }
  return '';
}

/**
 * 从 RPC #5 字符串表解析产品 (按表中出现顺序).
 * 单条解析失败时 console.warn 并跳过, 不抛错.
 * @param category 默认 'plaquette' — 仅用于 plate-search (vehicle 单类目); ref-search 传入会被
 *   逐 article 覆盖 (按 segment 文本判 disque vs plaquette).
 */
export function parseRpc5StringTable(
  stringTable: string[],
  category: ProductCategory = 'plaquette'
): Rpc5Product[] {
  const n = stringTable.length;

  // === Pass 1: 收集 articleId 位置 (按表中顺序去重) ===
  const articlePositions: number[] = [];
  const articleIsVirtual: boolean[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < n; i++) {
    const s = stringTable[i] ?? '';
    if (isArticleId(s) && !seenIds.has(s)) {
      seenIds.add(s);
      articlePositions.push(i);
      articleIsVirtual.push(false);
    }
  }

  // === Pass 1.5: 孤立 supplier code (附近 ±ORPHAN_RADIUS 无 articleId) → 创建虚拟 article ===
  // GDB1330 ref-search 暴露: LPR 行 (idx 60 ref + idx 62 code + idx 63 "LPR GROUP") 没有 articleId,
  // 不创建虚拟 entry 会导致 LPR 的 code 在 Pass 2 被分配到远处的另一品牌 article (TRW), 互相覆盖.
  const ORPHAN_RADIUS = 6;
  const virtualCodeIdxs: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = stringTable[i] ?? '';
    if (!isKnownSupplierCode(s)) continue;
    const hasNearby = articlePositions.some(
      (pos) => Math.abs(pos - i) <= ORPHAN_RADIUS
    );
    if (!hasNearby) virtualCodeIdxs.push(i);
  }
  if (virtualCodeIdxs.length > 0) {
    for (const i of virtualCodeIdxs) {
      articlePositions.push(i);
      articleIsVirtual.push(true);
    }
    // 按表中位置排序, 保持两个数组一一对应
    const combined = articlePositions.map((p, idx) => ({ p, v: articleIsVirtual[idx]! }));
    combined.sort((a, b) => a.p - b.p);
    articlePositions.length = 0;
    articleIsVirtual.length = 0;
    for (const { p, v } of combined) {
      articlePositions.push(p);
      articleIsVirtual.push(v);
    }
  }

  // === Pass 2: 每个 article 找最近的 supplier code, 取其品牌 ===
  // 注: 之前用 code → 最近 article 的方向, 当多个 code 竞争同一 article 时, 后处理的 code
  // 会覆盖前面, 导致离 BLUE PRINT code 更近的 BLUE PRINT article 被远处 FEBI code 抢走 (绕道).
  // article → 最近 code 的方向语义清晰: 一个 article 的品牌就是它最近的 code 的品牌.
  const codePositions: Array<{ idx: number; code: string }> = [];
  for (let i = 0; i < n; i++) {
    const s = stringTable[i] ?? '';
    if (isKnownSupplierCode(s)) codePositions.push({ idx: i, code: s });
  }

  const articleBrand: (string | null)[] = articlePositions.map(() => null);
  const consumedByCode = new Set<number>();
  for (const { idx } of codePositions) {
    consumedByCode.add(idx);
    consumedByCode.add(idx + 1);
  }
  // Section-based brand assignment: article 属于 "在它(或它+5)之前出现的最后一个 supplier code"
  // 的品牌段. 这吃下三种 Exadis 布局:
  //   - code 紧跟 articleId+ref (BLUE PRINT/FEBI/FERODO 单 article)
  //   - code 作为 header 在多篇同品牌 article 之前 (BREMBO/BOSCH/VALEO 大段)
  //   - article 略早于 code 的 "leading article" (BLUE PRINT/FEBI 首篇)
  // 之前用 "最近 code (双向)" 会让 BREMBO 长段里的 article 被下一段的 BLUE PRINT code 抢走 —
  // BLUE PRINT 位置上更近但语义上属于上一个段.
  const HEADER_LOOKAHEAD = 5;
  const sortedCodes = [...codePositions].sort((a, b) => a.idx - b.idx);
  for (let k = 0; k < articlePositions.length; k++) {
    const i = articlePositions[k]!;
    let best: { idx: number; code: string } | null = null;
    for (const cp of sortedCodes) {
      if (cp.idx <= i + HEADER_LOOKAHEAD) best = cp;
      else break;
    }
    if (!best) {
      // Article 出现在第一个 code 之前 — 取第一个 code 的品牌 (整池只一个段时回退)
      best = sortedCodes[0] ?? null;
    }
    if (!best) continue;
    // 优先用 code+1 位置的字面品牌名做显示名 (e.g. "LPR GROUP" 优于纯 "LPR")
    const next = stringTable[best.idx + 1] ?? '';
    const display = STRONG_BRAND_TEXT[next] ?? SUPPLIER_CODE_TO_BRAND[best.code]!;
    articleBrand[k] = display;
  }

  // === Pass 3: 未分配 article 在自身段内找 STRONG_BRAND_TEXT (跳过 code+1 位置) ===
  for (let k = 0; k < articlePositions.length; k++) {
    if (articleBrand[k]) continue;
    const i = articlePositions[k]!;
    const segLo = k > 0 ? articlePositions[k - 1]! + 1 : 0;
    const segHi = k + 1 < articlePositions.length ? articlePositions[k + 1]! : n;
    for (let j = segLo; j < segHi; j++) {
      if (j === i) continue;
      if (consumedByCode.has(j)) continue;
      const t = stringTable[j] ?? '';
      const mapped = STRONG_BRAND_TEXT[t];
      if (mapped) {
        articleBrand[k] = mapped;
        break;
      }
    }
  }

  // === Pass 4: 仍未分配的继承前一篇的品牌 ===
  let lastBrand = '';
  for (let k = 0; k < articlePositions.length; k++) {
    if (articleBrand[k]) {
      lastBrand = articleBrand[k]!;
    } else if (lastBrand) {
      articleBrand[k] = lastBrand;
    }
  }

  // === Pass 5: 为每篇 article 找 ref + stockId + axle + per-article productType, 输出 ===
  const axleByArticle = extractAxleByArticle(stringTable);
  const oemMasked = buildOemMaskedPositions(stringTable);
  const products: Rpc5Product[] = [];
  for (let k = 0; k < articlePositions.length; k++) {
    const i = articlePositions[k]!;
    const isVirtual = articleIsVirtual[k]!;
    const articleId = isVirtual ? '' : stringTable[i]!;
    const segLo = k > 0 ? articlePositions[k - 1]! + 1 : 0;
    const segHi = k + 1 < articlePositions.length ? articlePositions[k + 1]! : n;
    const brand = articleBrand[k] ?? '';
    const reference = findRef(stringTable, i, segLo, segHi, oemMasked, isVirtual, brand);
    const stockId = isVirtual ? '' : findStockId(stringTable, i, segLo);
    const axle = articleId ? axleByArticle.get(articleId) ?? null : null;
    const productType = detectSegmentCategory(stringTable, segLo, segHi, category);

    if (!brand) {
      console.warn(`[rpc5-parser] skip ${isVirtual ? 'virtual@' + i : 'articleId=' + articleId}: no brand resolved`);
      continue;
    }
    if (!reference) {
      console.warn(`[rpc5-parser] skip ${isVirtual ? 'virtual@' + i : 'articleId=' + articleId} brand=${brand}: no reference`);
      continue;
    }
    products.push({ articleId, stockId, brand, reference, axle, productType });
  }

  return products;
}

/**
 * Per-article 类目识别 (ref-search 跨类目, 不能用 caller 传入的固定 category).
 * 在 segment 范围内扫描描述/标签文本: "Disque de frein" / "Plaquettes de frein" / "Kit de plaquettes".
 * 没明确指示则回退到 caller 传入的 fallback (plate-search 单类目时是准确的).
 */
function detectSegmentCategory(
  table: string[],
  segLo: number,
  segHi: number,
  fallback: ProductCategory
): ProductCategory {
  for (let j = segLo; j < segHi; j++) {
    const s = table[j] ?? '';
    if (/^Disques?\s+de\s+frein/i.test(s)) return 'disque';
    if (/Plaquettes?\s+de\s+frein|Kit\s+de\s+plaquettes/i.test(s)) return 'plaquette';
  }
  return fallback;
}
