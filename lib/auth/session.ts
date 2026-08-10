/**
 * Session lifecycle, database side.
 *
 * `proxy.ts` only checks that a cookie is signed and unexpired, which is cheap
 * and stateless. This module is the authoritative answer: it confirms the
 * session row still exists and that its user has not been disabled since. Any
 * code that serves purchase prices must go through `getCurrentUser`, not
 * through the proxy alone.
 *
 * Node runtime only.
 */

import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { SESSION_COOKIE, hashSessionId, newSessionId, signToken, verifyToken } from "./tokens";

/** Lifetime of a sign-in. Shop terminals are shared, so this stays short. */
const TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? "7");

/** `lastSeenAt` is refreshed at most this often, to avoid a write per request. */
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000;

export interface CurrentUser {
    id: string;
    username: string;
    displayName: string | null;
    franchise: string | null;
    role: string;
}

export interface IssuedSession {
    token: string;
    expiresAt: Date;
}

export async function createSession(userId: string): Promise<IssuedSession> {
    const sessionId = newSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
        id: await hashSessionId(sessionId),
        userId,
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
    });

    return { token: await signToken(sessionId, expiresAt), expiresAt };
}

/**
 * Resolves a raw cookie value to its user, or null. Also drops the row when the
 * session has expired or its user was disabled, so a revoked account stops
 * costing a lookup on every request.
 */
export async function resolveSession(token: string | undefined): Promise<CurrentUser | null> {
    const verified = await verifyToken(token);
    if (!verified) return null;

    const sessionKey = await hashSessionId(verified.sessionId);
    const rows = await db
        .select({
            sessionExpiresAt: sessions.expiresAt,
            lastSeenAt: sessions.lastSeenAt,
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            franchise: users.franchise,
            role: users.role,
            disabledAt: users.disabledAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, sessionKey))
        .limit(1);

    const row = rows[0];
    if (!row) return null;

    const now = new Date();
    if (row.sessionExpiresAt.getTime() <= now.getTime() || row.disabledAt) {
        await db.delete(sessions).where(eq(sessions.id, sessionKey));
        return null;
    }

    if (now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
        await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, sessionKey));
    }

    return {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        franchise: row.franchise,
        role: row.role,
    };
}

/** The signed-in user for the current request, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
    const jar = await cookies();
    return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

/** Ends the session behind the given cookie value. Silent when already gone. */
export async function destroySession(token: string | undefined): Promise<void> {
    const verified = await verifyToken(token);
    if (!verified) return;
    await db.delete(sessions).where(eq(sessions.id, await hashSessionId(verified.sessionId)));
}

/** Ends every session of a user, which is what revoking an account means. */
export async function destroyUserSessions(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping for expired rows; nothing depends on it for correctness. */
export async function purgeExpiredSessions(): Promise<number> {
    const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    return result.changes ?? 0;
}

/**
 * Cookie attributes. `secure` is off on plain HTTP so the login still works on
 * `localhost`; every deployed environment is HTTPS and gets the flag.
 */
export function sessionCookieOptions(expiresAt: Date) {
    return {
        name: SESSION_COOKIE,
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresAt,
    };
}

export { SESSION_COOKIE };

/** Lookup used by the login route. Keeps `users` behind a single module. */
export async function findUserByUsername(username: string) {
    const rows = await db
        .select()
        .from(users)
        .where(eq(users.username, username.trim().toLowerCase()))
        .limit(1);
    return rows[0] ?? null;
}
