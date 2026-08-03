/**
 * 从 Exadis RPC #5 字符串表里提取每个 articleId 的 axle (essieu) 字段.
 *
 * 规则 (Step 3 探针验证, 4 车 100% 命中):
 *   表里 "Essieu avant" / "Essieu arrière" 是稀疏 token (每车仅 1-2 个), 出现在产品属性段中.
 *   GWT-RPC 默认只在 axle 变化时 emit 新 token, 其余产品沿用最近的值.
 *   因此线性扫表 + currentAxle state, 给每个 articleId 分配"最近一次 axle token"即可.
 */

export type AxleSide = 'avant' | 'arriere';

const AXLE_TOKEN_RE = /^Essieu\s+(avant|arri[èe]re)$/i;

function classifyToken(s: string): AxleSide | null {
  if (!s) return null;
  const m = AXLE_TOKEN_RE.exec(s);
  if (!m) return null;
  return /avant/i.test(m[1]!) ? 'avant' : 'arriere';
}

const ARTICLE_ID_RE = /^\d{7}$/;

/**
 * 线性扫 RPC #5 字符串表, 返回 articleId → axle 映射 (forward inheritance).
 * articleId 未在 axle token 后面的, 取 null.
 */
export function extractAxleByArticle(stringTable: string[]): Map<string, AxleSide | null> {
  const map = new Map<string, AxleSide | null>();
  let current: AxleSide | null = null;
  for (const raw of stringTable) {
    const s = raw ?? '';
    const a = classifyToken(s);
    if (a) {
      current = a;
      continue;
    }
    if (ARTICLE_ID_RE.test(s) && !map.has(s)) {
      map.set(s, current);
    }
  }
  return map;
}
