/**
 * Second door in front of the trace page.
 *
 * Being signed in as a franchisee is not enough: the trace exposes plates,
 * billed calls and the internals of every lookup. This gate is a shared secret
 * in `LOGS_PASSWORD`, deliberately outside the accounts table, so who can read
 * it does not depend on a role someone might set by accident.
 *
 * Signing reuses `lib/auth/tokens.ts` rather than inventing a second scheme.
 *
 * Server only.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "@/lib/auth/tokens";

export const LOGS_COOKIE = "jbo_logs";

/** Short lived on purpose: this is a debugging door, not a session. */
const TTL_HOURS = Number(process.env.LOGS_UNLOCK_TTL_HOURS ?? "12");

/** The payload the signature covers. Any other value is rejected. */
const SUBJECT = "logs";

export function logsPasswordConfigured(): boolean {
    return Boolean(process.env.LOGS_PASSWORD);
}

/** Constant time, and length differences never leak through the comparison. */
export function checkLogsPassword(candidate: string): boolean {
    const expected = process.env.LOGS_PASSWORD;
    if (!expected) return false;

    const a = createHash("sha256").update(candidate).digest();
    const b = createHash("sha256").update(expected).digest();
    return timingSafeEqual(a, b);
}

export async function issueLogsCookie(): Promise<{ value: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
    return { value: await signToken(SUBJECT, expiresAt), expiresAt };
}

export function logsCookieOptions(expiresAt: Date) {
    return {
        name: LOGS_COOKIE,
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresAt,
    };
}

/** True when the current request carries a valid, unexpired unlock cookie. */
export async function logsUnlocked(): Promise<boolean> {
    if (!logsPasswordConfigured()) return false;

    const jar = await cookies();
    const verified = await verifyToken(jar.get(LOGS_COOKIE)?.value);
    return verified?.sessionId === SUBJECT;
}
