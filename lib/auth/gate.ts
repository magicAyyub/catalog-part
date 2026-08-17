/**
 * A second door in front of a page, opened by a shared secret from `.env`.
 *
 * Being signed in as a franchisee is not enough for everything: the trace shows
 * plates and billed calls, account management hands out credentials. Both ask
 * for a secret held outside the accounts table, so who gets in never depends on
 * a role flag someone might set by accident.
 *
 * Signing reuses `lib/auth/tokens.ts` rather than inventing a second scheme.
 *
 * Server only.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "@/lib/auth/tokens";

export interface Gate {
    configured(): boolean;
    check(candidate: string): boolean;
    issue(): Promise<{ value: string; expiresAt: Date }>;
    cookieOptions(expiresAt: Date): {
        name: string;
        httpOnly: true;
        sameSite: "lax";
        secure: boolean;
        path: string;
        expires: Date;
    };
    unlocked(): Promise<boolean>;
}

interface GateConfig {
    /** Signed into the token, so a cookie for one door never opens another. */
    subject: string;
    cookieName: string;
    passwordEnv: string;
    ttlEnv: string;
    defaultTtlHours: number;
}

export function createGate(config: GateConfig): Gate {
    const secret = () => process.env[config.passwordEnv];

    return {
        configured: () => Boolean(secret()),

        // Temps constant, et une différence de longueur ne fuit pas par la
        // comparaison puisque les deux côtés sont hachés d'abord.
        check(candidate: string): boolean {
            const expected = secret();
            if (!expected) return false;
            return timingSafeEqual(
                createHash("sha256").update(candidate).digest(),
                createHash("sha256").update(expected).digest()
            );
        },

        async issue() {
            const hours = Number(process.env[config.ttlEnv] ?? String(config.defaultTtlHours));
            const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
            return { value: await signToken(config.subject, expiresAt), expiresAt };
        },

        cookieOptions(expiresAt: Date) {
            return {
                name: config.cookieName,
                httpOnly: true as const,
                sameSite: "lax" as const,
                secure: process.env.NODE_ENV === "production",
                path: "/",
                expires: expiresAt,
            };
        },

        async unlocked(): Promise<boolean> {
            if (!secret()) return false;
            const jar = await cookies();
            const verified = await verifyToken(jar.get(config.cookieName)?.value);
            return verified?.sessionId === config.subject;
        },
    };
}
