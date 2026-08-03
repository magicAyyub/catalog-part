export type ProductCategory = 'plaquette' | 'disque';

/** 单个 portal 返回的产品 (合并前) */
export interface SupplierProduct {
  brand: string; // "FERODO (FEDERAL MOGUL)"
  reference: string; // "FDB4180"
  priceNet: number | null; // 销售净价 (HT)
  priceGross: number | null; // 标价 (TTC)
  priceCost: number | null; // 进货价
  discountPct: number | null; // "72.5 %" → 72.5
  stock: number | string | null; // 数字数量 或 "disponible"/"rupture"
  supplier: 'preference' | 'exadis';
  /** 'avant' / 'arriere' / null. 与 Préférence BrakePartResult.axle 类型对齐. */
  axle?: 'avant' | 'arriere' | null;
  /** 产品类目: 'plaquette' (刹车片) / 'disque' (刹车盘). */
  productType: ProductCategory;
  raw?: Record<string, unknown>; // 原始字段保留
}

/** 合并后, 一行可能多家 + catalog 字段 */
export interface MergedProduct {
  brandKey: string; // 归一化后的合并 key 部分 (e.g. "FERODO")
  refKey: string; // 归一化后的合并 key 部分 (e.g. "FDB4180")
  brandDisplay: string; // 显示用品牌名 (取较完整版, 如 "FERODO (FEDERAL MOGUL)")
  refDisplay: string; // 显示用货号 (取较完整版, 保留空格如 "P 68 050X")
  prices: {
    preference?: SupplierProduct;
    exadis?: SupplierProduct;
  };
  catalog?: CatalogEnrichment; // 来自 catalog.json 的补全
  notInCatalog: boolean; // true: catalog 找不到, 字段全空
  /** axle 三源融合后的最终值: pref → exadis → catalog → null. 归一化为 'avant'/'arriere'/null. */
  axle: 'avant' | 'arriere' | null;
  /** axle 数据来源 (诊断用): 'preference' / 'exadis' / 'catalog' / 'inferred' / null */
  axleSource: 'preference' | 'exadis' | 'catalog' | 'inferred' | null;
  /** When axleSource === 'inferred', the consensus confidence + vote count.
   *  Lets the UI tooltip show "via consensus" + how strong. */
  axleInferredMeta?: {
    confidence: 'high' | 'medium';
    voteCount: number;
    sourceBrands: string;
  } | null;
  /** 产品类目, 从上游 SupplierProduct 继承 (同一 brand+ref 不跨类目). */
  productType: ProductCategory;
  /** ETF disc 等价品 (仅 disc 行可能命中); null 表无 ETF 对照. */
  etfEquivalent: EtfEquivalent | null;
  /**
   * 物理尺寸继承: 当本行 catalog.thickness/width/height 有空缺, 但同 etfEquivalent 组内
   * 其他兄弟行 (或 ETF article 自身) 填了, 借过来. UI 用 ?? fallback 优先 catalog 自身值.
   * source 标 'ETF EP0848' / 'FERODO FDB1466' 让 UI 可标注来源, null 表示没继承到任何字段.
   */
  inheritedSpec: {
    thickness: number | null;
    width: number | null;
    height: number | null;
    source: string;
  } | null;
  /**
   * Physical-fit check (ref-search only): true if this row's catalog dims diverge
   * significantly from the searched ref's ground-truth (width Δ > 5mm OR thickness Δ
   * > 2mm). When true, this row's ETF reverse-lookup was SUPPRESSED to prevent
   * unrelated ETF candidates from polluting the panel (e.g. FERODO FDB5025 at
   * width 137mm appearing in a GDB1330 search where the searched pad is 87mm wide).
   * UI may show a ⚠ icon. null = no check performed (e.g., plate-search) or ground-truth
   * unknown.
   */
  physicalFitSuspect: boolean | null;
  /**
   * TRW article(s) that this supplier row is cross-brand equivalent to, derived
   * STRICTLY from the ETF xlsx `Marque équivalente: TRW` column of this row's
   * ETF equivalent. Strict semantics same as ⭐⭐⭐ tier — curator-asserted only,
   * never WVA/OEM reverse-lookup (which can wander to a different cluster,
   * c.f. EP0430 → wrong GDB1279 via WVA vs xlsx-correct GDB1626/GDB2050).
   *
   * `refs` is a list because ETF often lists multiple TRW variants in a single
   * row (e.g. EP0430 → GDB1626 + GDB2050). UI joins them for display.
   * Dims correspond to the first TRW ref for hover context only.
   *
   * null when: row is itself TRW, no etfEquivalent on this row, or ETF row's
   * xlsx TRW column is empty.
   */
  trwEquivalent: {
    refs: string[];
    thickness: number | null;
    width: number | null;
    height: number | null;
  } | null;
  /**
   * True if this row is an accessory rather than a main pad/disc. Detected by
   * brand+ref pattern (e.g. DELPHI LX/LZ#### are wear sensor / dust shield kits
   * cross-listed by TecDoc's "fits with" relation, all with null physical dims).
   * UI demotes these to a collapsible section to avoid polluting the main results.
   */
  isAccessory: boolean;
  /**
   * Manufacturer production status (by-reference DB-only search only; undefined on
   * the plate path). Sourced from article_status.sqlite (catalog_v2 misc.articleStatusId),
   * display-only — never affects equivalence. `discontinued` true => the by-reference
   * UI demotes this row to a separate bottom section. null = (brand,ref) unknown to
   * the status table. Inline structural type to avoid an import cycle.
   */
  status?: {
    statusId: number;
    statusDesc: string;
    replacedBy: string | null;
    discontinued: boolean;
  } | null;
  /**
   * Internal TRW pricing — supplier menu price (pxBase) + negotiated target
   * purchasing price (pxTarget = pxBase × (1 - discount_pct)). Only populated
   * when this row's brand is TRW and master.getSupplierPrices returns a row
   * with non-null pxTarget. Source priority WINPRO > MENU (legacy seed).
   * Sales-team-facing data; display in price column + product header.
   */
  trwPrice?: {
    pxBase: number;
    pxTarget: number;
  } | null;
  /**
   * Internal Brembo pricing — supplier menu price (pxBase) + negotiated target
   * purchasing price (pxTarget = pxBase × (1 - discount_pct)). Same source
   * contract as trwPrice (WINPRO > MENU). Same display contract.
   */
  bremboPrice?: {
    pxBase: number;
    pxTarget: number;
  } | null;
  /**
   * Internal ETF pricing — direct ex-works cost (pxBase == pxTarget, no discount
   * applies since we buy from ETF at this price). Only populated when this row's
   * brand is ETF and the ref is in operations.sqlite::ops_supplier_prices under
   * supplier 'ETF_EXW'. Master backend only — legacy never set this field
   * (legacy surfaced ETF priceExw on cross-ref rows via etfEquivalent.priceExw).
   */
  etfPrice?: {
    pxBase: number;
    pxTarget: number;
  } | null;
  /**
   * Generic internal-pricing chips for brands other than TRW / BREMBO / ETF
   * (those keep their dedicated fields above for backward compatibility).
   *
   * One entry per supplier with a non-null pxTarget. Populated after WinPro
   * sync writes rows into ops_supplier_prices and the brand has a discount
   * configured (or inherits one via brand-only fallback in
   * master.getBrandDiscount). Renders as `<Brand> cible <pxTarget> /
   * <pxBase> menu` chips in ResultsTable / ProductCardView, mirroring the
   * existing TRW / Brembo cible visual.
   */
  internalPrices?: Array<{
    supplier: string;       // 'WINPRO' / 'MENU' / 'EXADIS' / ...
    brandLabel: string;     // brand-name used in the chip, e.g. "BOSCH"
    pxBase: number;         // raw menu price from supplier
    pxTarget: number;       // pxBase × (1 - discountPct)
    discountPct: number;    // discount fraction used for the computation
  }> | null;
  /**
   * Distinct `relation_source` values from catalog_master.article_relations
   * that connect this row's (brand, ref) to the searched anchor in either
   * direction. Empty / null when the row is the anchor itself, or when no
   * direct relation edge exists (e.g. row reached via cluster expansion).
   *
   * Possible values:
   *   tecdoc / tecdoc+xlsx_confirmed / tecdoc_2hop  → TecDoc-family edge
   *   wva_inferred                                  → WVA-inferred edge
   *   xlsx_only                                     → ETF curator xlsx edge
   *   preference_ground_truth                       → Préférence portal scrape
   *   fahren_oem_pivot                              → FAHREN OEM consensus
   *
   * UI groups the TecDoc-family into one chip, badges WVA / xlsx separately,
   * and hides preference_ground_truth + fahren_oem_pivot (already implicit).
   */
  matchSources?: string[] | null;
  /**
   * True when this row is an ETF article that entered the search via the
   * ETF curator xlsx cross-ref layer (i.e. xlsx asserted the row's ref is
   * an equivalence for the searched anchor) — NOT via article_relations.
   * UI surfaces a small ETF mini-logo chip inline with the ref so the
   * operator distinguishes curator-asserted ETF hits from TecDoc/WVA
   * graph hits.
   *
   * Only meaningful for `brandDisplay === 'ETF'` rows; left null on
   * other brands.
   */
  viaEtfXlsx?: boolean | null;
  /**
   * Set on rows brought in via the EXADIS Brembo↔distributor xref aux table
   * (lib/catalog/master.ts `getExadisBremboEquivs` / `getExadisReverseEquivs`).
   * Used to exempt these rows from the `NO_CATALOG_DROP_BRANDS` filter — BLUE
   * PRINT / LPR rows with no master article would normally be dropped as
   * "no catalog noise", but an EXADIS aux match is a high-quality distributor
   * cross-reference and should surface even when catalog.json doesn't index
   * the underlying ref.
   */
  viaExadisAux?: boolean | null;
}

/** Ground-truth context for ref-search physical-fit filtering.
 *  Computed from `findByBrandRef(detected_brand, searched_ref)` at the API entry.
 *  Passed through `mergeRefSearchProducts → enrichCatalog` so each row's dims can
 *  be compared. */
export interface RefSearchContext {
  /** The searched ref as the user typed it (uppercase trimmed). */
  ref: string;
  /** Brand detected from ref prefix (best-effort) — e.g. 'TRW' for 'GDB1330'. */
  detectedBrand: string | null;
  /** Ground-truth catalog enrichment of the searched ref, if found in catalog. */
  groundTruth: CatalogEnrichment | null;
}

/**
 * ETF 跨品牌等价品 — disc 行的 (brand, ref) 命中 ETF 副索引时, 或 supplier row 的 catalog
 * OEM 列表与 ETF disc 的 oem_numbers 精确共享 ref 时, 附在 MergedProduct 上.
 * 由 lib/catalog 副索引提供, aggregate 注入. discriminated `matchedVia.via` 区分两种命中方式.
 */
export interface EtfEquivalent {
  /** ETF 自家货号, 如 "EB2532". */
  articleNumber: string;
  /** ETF EXW Turin 价 (字符串原样, 如 "14.12 €"); null 表 Excel 未填. */
  priceExw: string | null;
  /** ETF article 上的 OEM 列表 (车厂 + ref), 用于 hover/详情. */
  oemNumbers: ReadonlyArray<{ make: string; ref: string }>;
  /**
   * 该 ETF article 的全部跨品牌等价品键值, 如:
   * { BREMBO: "09.5843.11", TRW: "DF2734", FERODO: "...", ASHIKA: "...", XEN: "...", "BLUE PRINT": "..." }.
   * 只含 Excel 实际填写的字段.
   */
  crossRefs: Readonly<Record<string, string>>;
  /**
   * 命中方式 (discriminated):
   *   - 'cross-ref': 通过 ETF Excel 里的 BREMBO/TRW/FERODO/... 列与 supplier row 的 (brand, ref) 配对.
   *   - 'wva': 通过 ETF.wva_numbers 与 supplier row (或其 TecDoc enrichment) 的 wvaNumbers
   *     精确共享 (plaquette 行业标准 ID).
   *   - 'oem': 通过 TecDoc catalog 上 supplier article 的 oem_numbers 与 ETF article 的 OEM ref 精确共享.
   */
  matchedVia:
    | { via: 'cross-ref'; brand: string; ref: string }
    | { via: 'wva'; wva: string }
    | { via: 'oem'; oemRef: string; oemMake: string };
}

/**
 * Aggregate 响应里"ETF 候选区"用的去重 ETF 项: 一辆车命中多次同一 ETF 时, 合并成一条;
 * `linkedSupplierRows` 记录跟多少 supplier merged rows 关联; `matchedVia` 记录命中方式
 * (有任一行通过 cross-ref 则视为 'cross-ref', 否则 'oem' — 影响 UI 标签颜色).
 */
export interface EtfCandidate {
  articleNumber: string;
  priceExw: string | null;
  oemNumbers: ReadonlyArray<{ make: string; ref: string }>;
  crossRefs: Readonly<Record<string, string>>;
  matchedVia: 'cross-ref' | 'wva' | 'oem';
  linkedSupplierRows: number;
  /** Additional ETF article fields used by the top-of-results recommendation
   *  cards (Fix 2). Populated server-side from catalog.json. May be null for
   *  ETF refs not in catalog. */
  imageUrl: string | null;
  priceRetail: string | null;
  thickness: number | null;
  width: number | null;
  height: number | null;
  axle: 'avant' | 'arriere' | null;
  wvaNumbers: ReadonlyArray<string>;
  /**
   * Confidence tier (1-3 stars) per user spec Task #29:
   *   3: cross-ref backed by xlsx curator (high commercial confidence)
   *   2: WVA reverse-lookup hit (industry-standard ID, good but not curator-backed)
   *   1: only OEM reverse-lookup (single OEM can map to multiple pads — weak)
   * UI default: show only 3-star, collapse 2/1 into expandable section.
   */
  confidence: 1 | 2 | 3;
}

export interface CatalogEnrichment {
  articleNumber: string;
  wvaNumbers: string[]; // ["23973", "24538", "24914"]
  /** OEM 编号 + 车厂. catalog.json 原始格式就是 {make, ref}; 之前压扁成 string[] 丢了 make. */
  oemNumbers: Array<{ make: string; ref: string }>;
  fmsiCode: string | null;
  /** catalog.axle，如 "Essieu avant" / "Essieu arrière" */
  axle: string | null;
  thickness: number | null; // mm
  width: number | null;
  height: number | null;
  /** 首张图 URL，等同 imageUrls[0] */
  imageUrl: string | null;
  /** catalog.image_urls */
  imageUrls: string[];
  /** catalog.generic_name */
  generic: string | null;
  /** catalog.additional_criteria */
  additional: unknown;
  /** Commercial product-line label, e.g. "PRIME LINE - UV Coated", "PRO+", "COTEC".
   *  From misc.additionalDescription. ~35% fill. Useful for sales differentiation. */
  additionalDescription: string | null;
  /** Outer packaging count (typically 1). ~99% fill. */
  quantityPerPackage: number | null;
  /** Parts per package (1/2/4 for brake pairs). ~86% fill. */
  quantityPerPartPerPackage: number | null;
  /** YYYYMMDD int when articleStatus became effective. ~95% fill.
   *  Useful for "when did this go discontinued / available". */
  articleStatusValidFromDate: number | null;
  /**
   * Structured spec parsed from `tecdoc_articles.criteria_list` for brake products.
   * Populated by enrichCatalog when the row's (brand, ref) is in tecdoc_articles.
   * Fields are null when the corresponding criteriaId isn't filled by the manufacturer.
   * Display rule (per UX): hide a Spec row entirely when its source field is null.
   */
  spec?: {
    side: 'avant' | 'arriere' | null;          // criteriaId=100
    system: string | null;                     // criteriaId=649 — OE brake system brand
    thicknessMm: number | null;                // pad: criteriaId=124
    widthMm: number | null;                    // pad: criteriaId=206
    heightMm: number | null;                   // pad: criteriaId=209
    discThicknessMm: number | null;            // disc: criteriaId=274
    discMinThicknessMm: number | null;         // disc: criteriaId=328 (wear limit)
    discDiameterMm: number | null;             // disc: criteriaId=497
    discCenterDiameterMm: number | null;       // disc: criteriaId=501
    discType: string | null;                   // criteriaId=232 ("plein" / "ventilé")
    wearIndicator: string | null;              // criteriaId=593
    complementary1: string | null;             // criteriaId=596
    complementary2: string | null;             // criteriaId=836 (preferred — more specific)
  } | null;
  /**
   * Cluster-aggregated "Adapté" car makes — derived at request time from
   * tecdoc_relations cluster + per-member oem_list. Filtered by member-count
   * consensus (≥5 main / 3-4 secondary / ≤2 dropped as pollution).
   */
  adapte?: {
    mainMakes: Array<{ make: string; refCount: number; memberCount: number; refs: string[] }>;
    secondaryMakes: Array<{ make: string; refCount: number; memberCount: number; refs: string[] }>;
    clusterSize: number;
  } | null;
}

export interface SupplierSession {
  supplier: 'preference' | 'exadis';
  loggedInAt: number; // Date.now()
  expiresAt: number; // 过期时间戳
  state: Record<string, unknown>; // 各家自己的 session state
}

/** Supplier 抽象接口 — 每家 portal 实现 */
export interface Supplier {
  readonly name: 'preference' | 'exadis';
  /** 登录并返回新 session */
  login(): Promise<SupplierSession>;
  /**
   * 用现有 session 搜索某一类目, 如果 session 过期会 throw SessionExpiredError.
   * category 默认 'plaquette' 兼容旧调用.
   */
  search(
    plate: string,
    session: SupplierSession,
    category?: ProductCategory
  ): Promise<SupplierProduct[]>;
}

export class SessionExpiredError extends Error {
  constructor(public supplier: string) {
    super(`${supplier} session expired`);
  }
}
