/**
 * HTTP transport for the Exadis portal.
 *
 * Uses `node:https` rather than `fetch` for one reason: their server omits its
 * intermediate certificate, and only the low level API lets the missing link be
 * supplied per request. Global `fetch` would need the trust store weakened for
 * the whole process.
 *
 * Server only.
 */

import { request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";
import { GANDI_INTERMEDIATE_PEM } from "./ca";

/** System roots plus the link Exadis fails to send. Verification stays on. */
const TRUSTED = [...rootCertificates, GANDI_INTERMEDIATE_PEM];

export interface ExadisResponse {
    status: number;
    body: string;
    setCookie: string[];
    location?: string;
}

export interface ExadisRequestOptions {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
    /** The SSO exchange answers with a redirect chain that must be walked. */
    follow?: number;
}

/** Walks redirects, accumulating every `set-cookie` seen along the way. */
export async function exadisRequestFollowing(
    url: string,
    options: ExadisRequestOptions
): Promise<ExadisResponse> {
    const max = options.follow ?? 0;
    let current = url;
    const collected: string[] = [];

    for (let hop = 0; ; hop++) {
        const response = await exadisRequest(current, options);
        collected.push(...response.setCookie);

        const location = response.location;
        if (hop >= max || !location || response.status < 300 || response.status >= 400) {
            return { ...response, setCookie: collected };
        }
        current = new URL(location, current).toString();
    }
}

function exadisRequest(url: string, options: ExadisRequestOptions): Promise<ExadisResponse> {
    const { method = "GET", headers = {}, body, timeoutMs } = options;

    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const req = httpsRequest(
            {
                hostname: target.hostname,
                port: target.port || 443,
                path: `${target.pathname}${target.search}`,
                method,
                headers: body ? { ...headers, "Content-Length": Buffer.byteLength(body) } : headers,
                ca: TRUSTED,
                servername: target.hostname,
                timeout: timeoutMs,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.on("end", () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString("utf-8"),
                        setCookie: res.headers["set-cookie"] ?? [],
                        location: res.headers.location,
                    });
                });
            }
        );

        req.on("timeout", () => {
            req.destroy(new Error(`Exadis n'a pas répondu en ${timeoutMs} ms.`));
        });
        req.on("error", reject);

        if (body) req.write(body);
        req.end();
    });
}
