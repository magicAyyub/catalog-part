/**
 * 从 RPC #6 (getArticleDispoPrix) 响应体提取每个产品的 ArticleDispo (库存/可用性).
 *
 * 经 EZ494ZA + CG534WF 抓包验证 (用户在 Exadis 网页对照确认):
 *   - 每个产品 slot 末尾有 `,leadRef,Y,7,1,6,0,0,0,-1,0,` 模式
 *   - leadRef = GWT 1-based pool ref → pool 里要么 "22" (主仓, 绿球 "Dispo J"/"J+1")
 *                                    要么 "25" (外采, 黄球 "Contactez-nous")
 *   - Y = inline int (主仓 31/32, 外采 50/60). BREMBO 31 vs 32 对应"今天发" vs "明天发", 细微差, 不映射.
 *   - -1 = 次级库存槽 sentinel
 *
 * 响应体里产品按 REVERSE 顺序编码 (input slot 8 = body slot 0).
 */

export interface StockToken {
  /** Pool 里命中的字符串 ("22" / "25" / null) */
  depotCode: string | null;
  /** 内联 Y 值 (31/32/50/60 等) */
  quantity: number | null;
}

/** 映射 depotCode → 可读 stock label (法语,与 Préférence 风格一致) */
export function decodeStockLabel(token: StockToken | null | undefined): string | null {
  if (!token || !token.depotCode) return null;
  if (token.depotCode === '22') return 'Disponible';
  if (token.depotCode === '25') return 'Sur demande';
  return null;
}

/**
 * 从单个 RPC #6 batch 的 raw body 提取 stock token 列表.
 * 返回数组按 **input slot 0..8 顺序** (调用方关心的顺序), 不是 body 编码顺序.
 * 长度恒为 9 (即使 batch 只 3 个真产品, 后 6 个是 padding 副本).
 */
export function extractStockTokens(rawBody: string, pool: string[]): StockToken[] {
  // 匹配 `,leadRef,Y,7,1,6,0,0,0,-1,0,`
  const re = /,(\d+),(\d+),(\d+),1,(\d+),0,0,0,-1,0,/g;
  const matches: Array<{ leadRef: number; quantity: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawBody)) !== null) {
    matches.push({
      leadRef: parseInt(m[1]!, 10),
      quantity: parseInt(m[2]!, 10),
    });
  }
  // Body 是 reverse 顺序: matches[i] (body slot i) = input slot (PADDED_SIZE-1 - i).
  const PADDED_SIZE = 9;
  const tokens: StockToken[] = new Array<StockToken>(PADDED_SIZE).fill({
    depotCode: null,
    quantity: null,
  } as StockToken);
  for (let i = 0; i < matches.length; i++) {
    const inputSlot = PADDED_SIZE - 1 - i;
    if (inputSlot < 0 || inputSlot >= PADDED_SIZE) continue;
    const { leadRef, quantity } = matches[i]!;
    // GWT 1-based pool ref → 0-based index
    const poolIdx = leadRef - 1;
    const depotCode = poolIdx >= 0 && poolIdx < pool.length ? pool[poolIdx] ?? null : null;
    // 只接受 "22" 或 "25", 其它视为无效 (避免误把 article ID 等当 depot code)
    const validDepot = depotCode === '22' || depotCode === '25' ? depotCode : null;
    tokens[inputSlot] = { depotCode: validDepot, quantity };
  }
  return tokens;
}
