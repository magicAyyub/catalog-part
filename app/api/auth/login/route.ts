/**
 * Sign-in.
 *
 * Answers the same generic message whether the account is unknown or the
 * password is wrong, and spends the same scrypt work in both cases, so the
 * response neither states nor times out which one it was.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, findUserByUsername, sessionCookieOptions } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/** Consecutive failures before the account stops answering. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const GENERIC_FAILURE = "Identifiant ou mot de passe incorrect.";

/**
 * A hash of a value nobody holds. Verifying against it on an unknown username
 * costs the same as a real check, which is the point.
 */
const DUMMY_HASH =
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
    "PXTULW3jP9eNyTooGytjVvEF0ny4wWvCYqr4sa+G6PCyQfgpa7PX0T0L33rGWqPux1yzeDMFMJ0cjccjZ4REhA==";

export async function POST(req: NextRequest) {
    let username: unknown;
    let password: unknown;

    try {
        ({ username, password } = await req.json());
    } catch {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
        return NextResponse.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
    }

    const user = await findUserByUsername(username);

    if (!user || user.disabledAt) {
        await verifyPassword(password, DUMMY_HASH);
        logger.warn("Rejected sign-in", { action: "auth-login-failed", reason: user ? "disabled" : "unknown" });
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
        const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
        logger.warn("Rejected sign-in on locked account", { action: "auth-login-locked", userId: user.id });
        return NextResponse.json(
            { error: `Compte temporairement bloqué. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.` },
            { status: 429 }
        );
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
        const failedAttempts = user.failedAttempts + 1;
        const lockedUntil =
            failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000) : null;

        await db.update(users).set({ failedAttempts, lockedUntil }).where(eq(users.id, user.id));

        logger.warn("Rejected sign-in", { action: "auth-login-failed", userId: user.id, failedAttempts });
        return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
    }

    await db
        .update(users)
        .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now })
        .where(eq(users.id, user.id));

    const { token, expiresAt } = await createSession(user.id);
    logger.info("Sign-in accepted", { action: "auth-login-success", userId: user.id });

    const res = NextResponse.json({
        user: {
            username: user.username,
            displayName: user.displayName,
            franchise: user.franchise,
            role: user.role,
        },
    });
    res.cookies.set({ ...sessionCookieOptions(expiresAt), value: token });
    return res;
}
