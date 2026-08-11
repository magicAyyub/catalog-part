/**
 * GWT-RPC plumbing: request headers, cookie jar, response string table.
 * Salvaged from `../app-etf`, trimmed to what the vehicle lookup needs.
 */

import { EXADIS_USER_AGENT } from "./templates";

export function buildHeaders(opts: {
    permutation: string;
    moduleBase: string;
    referer: string;
    accessToken?: string;
    cookies?: string;
}): Record<string, string> {
    const headers: Record<string, string> = {
        "User-Agent": EXADIS_USER_AGENT,
        Accept: "*/*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "text/x-gwt-rpc; charset=UTF-8",
        "X-GWT-Permutation": opts.permutation,
        "X-GWT-Module-Base": opts.moduleBase,
        Origin: "https://ecat.exadis.fr",
        Referer: opts.referer,
    };
    if (opts.accessToken) headers.access_token = opts.accessToken;
    if (opts.cookies) headers.Cookie = opts.cookies;
    return headers;
}

export function mergeCookies(existing: string, setCookieHeaders: string[]): string {
    const jar = new Map<string, string>();

    for (const pair of existing.split(";")) {
        const [name, ...rest] = pair.trim().split("=");
        if (name) jar.set(name, rest.join("="));
    }
    for (const header of setCookieHeaders) {
        const [name, ...rest] = header.split(";")[0].split("=");
        if (name) jar.set(name.trim(), rest.join("=").trim());
    }

    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** Pulls the trailing JSON string array out of a `//OK[...]` response. */
export function extractStringTable(body: string): string[] | null {
    if (!body.startsWith("//OK")) return null;

    const start = body.lastIndexOf('["');
    if (start < 0) return [];

    let depth = 0;
    let end = -1;
    for (let i = start; i < body.length; i++) {
        if (body[i] === "[") depth++;
        else if (body[i] === "]") {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end < 0) return null;

    try {
        const parsed = JSON.parse(body.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
        return null;
    }
}
