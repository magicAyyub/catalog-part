/**
 * GWT-RPC 工具: 构建 headers, 合并 cookies, 提取响应字符串表.
 * 移植自 scripts/dev/exadis-poc.ts 的同名函数.
 */

import { EXADIS_USER_AGENT } from './templates';

export function buildHeaders(opts: {
  permutation: string;
  moduleBase: string;
  referer: string;
  accessToken?: string;
  cookies?: string;
}): HeadersInit {
  const h: Record<string, string> = {
    'User-Agent': EXADIS_USER_AGENT,
    Accept: '*/*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
    'X-GWT-Permutation': opts.permutation,
    'X-GWT-Module-Base': opts.moduleBase,
    Origin: 'https://ecat.exadis.fr',
    Referer: opts.referer,
  };
  if (opts.accessToken) h.access_token = opts.accessToken;
  if (opts.cookies) h.Cookie = opts.cookies;
  return h;
}

export function getSetCookieArr(resp: Response): string[] {
  const fn = (resp.headers as { getSetCookie?: () => string[] }).getSetCookie;
  return fn ? fn.call(resp.headers) : [];
}

export function mergeCookies(existing: string, setCookieHeaders: string[]): string {
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

/**
 * 从 //OK[...,[strings],trailers] 响应里提取最后一个 JSON 字符串数组.
 */
export function extractStringTable(responseBody: string): string[] | null {
  if (!responseBody.startsWith('//OK')) return null;
  const lastBracket = responseBody.lastIndexOf('["');
  if (lastBracket < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = lastBracket; i < responseBody.length; i++) {
    if (responseBody[i] === '[') depth++;
    else if (responseBody[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    const arr = JSON.parse(responseBody.slice(lastBracket, end + 1));
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch {
    return null;
  }
}

/**
 * 解析法语价格字符串 "65,34 €" → 65.34
 * "" / 不匹配 → null
 */
export function parsePriceFr(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.replace(/\s/g, '').match(/^([0-9]+(?:[.,][0-9]+)?)€?$/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}

/**
 * 解析百分比 "72.5 %" → 72.5, "72,5 %" → 72.5
 */
export function parsePercent(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.replace(/\s/g, '').match(/^([0-9]+(?:[.,][0-9]+)?)%$/);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.'));
}
