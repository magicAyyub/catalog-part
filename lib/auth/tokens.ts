/**
 * Session token format and signature.
 *
 * Deliberately built on Web Crypto only, so the exact same code verifies a
 * cookie in `proxy.ts` (Edge runtime) and in a route handler (Node). The signed
 * payload carries the expiry, which lets the proxy reject a stale cookie
 * without touching the database.
 *
 * A valid signature proves the token was issued here, nothing more. Whether the
 * session still exists, and whether its user is still enabled, is a database
 * question answered by `lib/auth/session.ts`.
 */

export const SESSION_COOKIE = "jbo_session";

/** `<sessionId>.<expiresAtSeconds>.<signature>`, all base64url. */
const TOKEN_PARTS = 3;

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * The signing secret. Missing in production is fatal rather than defaulted:
 * a predictable secret lets anyone mint a valid cookie.
 */
function readSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error(
            "AUTH_SECRET is missing or shorter than 32 characters. Generate one with `openssl rand -base64 48`."
        );
    }
    return secret;
}

async function hmacKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(readSecret()),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

/** Opaque session identifier, 32 random bytes. Also the cookie's first part. */
export function newSessionId(): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * What gets stored as `sessions.id`. Hashing means a leak of the table does not
 * hand out usable cookies.
 */
export async function hashSessionId(sessionId: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
    return toBase64Url(new Uint8Array(digest));
}

export async function signToken(sessionId: string, expiresAt: Date): Promise<string> {
    const payload = `${sessionId}.${Math.floor(expiresAt.getTime() / 1000)}`;
    const signature = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
    return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export interface VerifiedToken {
    sessionId: string;
    expiresAt: Date;
}

/** 32 random bytes in unpadded base64url produced by `newSessionId()` is 43 chars. */
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Returns null on anything suspect: malformed token, bad signature, past
 * expiry. Comparison goes through `crypto.subtle.verify` rather than a string
 * equality, which would leak the signature one byte at a time.
 */
export async function verifyToken(token: string | undefined): Promise<VerifiedToken | null> {
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== TOKEN_PARTS) return null;

    const [sessionId, expiresAtRaw, signature] = parts;
    const expiresAtSeconds = Number(expiresAtRaw);
    if (!sessionId || !SESSION_ID_REGEX.test(sessionId) || !Number.isSafeInteger(expiresAtSeconds)) return null;

    let valid: boolean;
    try {
        valid = await crypto.subtle.verify(
            "HMAC",
            await hmacKey(),
            fromBase64Url(signature),
            new TextEncoder().encode(`${sessionId}.${expiresAtRaw}`)
        );
    } catch {
        // Signature non décodable en base64url : jeton forgé, on refuse.
        return null;
    }
    if (!valid) return null;

    const expiresAt = new Date(expiresAtSeconds * 1000);
    if (expiresAt.getTime() <= Date.now()) return null;

    return { sessionId, expiresAt };
}
