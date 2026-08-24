/** Plomberie GWT-RPC : entêtes, pot à cookies, lecture des réponses. */

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

/** Tableau de chaînes final d'une réponse GWT, quel que soit son préfixe. */
function extractTail(body: string): string[] | null {
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

/** Valeurs d'une réponse aboutie. Null si le portail a rendu autre chose. */
export function extractStringTable(body: string): string[] | null {
    return body.startsWith("//OK") ? extractTail(body) : null;
}

/**
 * Nom de l'exception Java d'une réponse `//EX`.
 *
 * Le portail rend 200 là où une API rendrait un 4xx : ce nom est le seul
 * élément qui distingue une plaque inconnue d'une panne.
 */
export function extractExceptionName(body: string): string | null {
    if (!body.startsWith("//EX")) return null;

    const thrown = extractTail(body)?.find((value) => value.includes("Exception"));
    return thrown ? thrown.split("/")[0] : null;
}
