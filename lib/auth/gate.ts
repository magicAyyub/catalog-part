/**
 * Seconde porte devant une page, ouverte par un secret partagé venu de `.env`.
 *
 * Le mécanisme est générique ; la seule porte du projet est décrite dans
 * `lib/admin/access.ts`.
 *
 * La signature réutilise `lib/auth/tokens.ts` plutôt que d'inventer un second
 * schéma.
 *
 * Serveur uniquement.
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
