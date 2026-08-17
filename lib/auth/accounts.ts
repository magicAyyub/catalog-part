/**
 * Account operations, shared by the CLI and the management page.
 *
 * The rules that matter live here once: what a username may look like, and the
 * fact that disabling an account or resetting its password closes every open
 * session. A cookie stays signature-valid until it expires, so closing the
 * sessions is what makes a revocation immediate.
 *
 * Server only.
 */

import { randomUUID, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";

export class AccountError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = "AccountError";
    }
}

export type AccountRole = "user" | "admin";

export interface AccountSummary {
    id: string;
    username: string;
    displayName: string | null;
    franchise: string | null;
    role: string;
    disabled: boolean;
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
}

/** 24 characters of base64url, roughly 144 bits. */
export function generatePassword(): string {
    return randomBytes(18).toString("base64url");
}

export function normaliseUsername(raw: string | undefined): string {
    const username = (raw ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        throw new AccountError(
            "Identifiant invalide. Attendu : 3 à 32 caractères parmi a-z, 0-9, point, tiret, tiret bas.",
            400
        );
    }
    return username;
}

function summarise(row: typeof users.$inferSelect): AccountSummary {
    return {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        franchise: row.franchise,
        role: row.role,
        disabled: row.disabledAt !== null,
        lockedUntil: row.lockedUntil,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
    };
}

export async function listAccounts(): Promise<AccountSummary[]> {
    const rows = await db.select().from(users).orderBy(users.username);
    return rows.map(summarise);
}

async function findAccount(username: string) {
    const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    const user = rows[0];
    if (!user) throw new AccountError(`Aucun compte "${username}".`, 404);
    return user;
}

export interface CreateAccountInput {
    username: string;
    displayName?: string | null;
    franchise?: string | null;
    role?: string;
    /** Omitted, a strong one is generated and returned once. */
    password?: string;
}

export interface CreatedAccount {
    account: AccountSummary;
    /** Only present when the password was generated here. */
    generatedPassword: string | null;
}

export async function createAccount(input: CreateAccountInput): Promise<CreatedAccount> {
    const username = normaliseUsername(input.username);

    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing[0]) throw new AccountError(`Le compte "${username}" existe déjà.`, 409);

    const role = input.role ?? "user";
    if (role !== "user" && role !== "admin") {
        throw new AccountError('Rôle invalide. Attendu : "user" ou "admin".', 400);
    }

    const generated = !input.password;
    const password = input.password ?? generatePassword();

    const row = {
        id: randomUUID(),
        username,
        passwordHash: await hashPassword(password),
        displayName: input.displayName?.trim() || null,
        franchise: input.franchise?.trim() || null,
        role,
        failedAttempts: 0,
        createdAt: new Date(),
    };

    await db.insert(users).values(row);

    return {
        account: summarise({
            ...row,
            disabledAt: null,
            lockedUntil: null,
            lastLoginAt: null,
        } as typeof users.$inferSelect),
        generatedPassword: generated ? password : null,
    };
}

export interface ResetOutcome {
    generatedPassword: string | null;
    closedSessions: number;
}

export async function resetAccountPassword(
    rawUsername: string,
    explicitPassword?: string
): Promise<ResetOutcome> {
    const user = await findAccount(normaliseUsername(rawUsername));

    const generated = !explicitPassword;
    const password = explicitPassword ?? generatePassword();

    await db
        .update(users)
        .set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
    const closed = await db.delete(sessions).where(eq(sessions.userId, user.id));

    return { generatedPassword: generated ? password : null, closedSessions: closed.changes };
}

/** Disabling closes the open sessions; enabling also clears a lockout. */
export async function setAccountEnabled(
    rawUsername: string,
    enabled: boolean
): Promise<{ closedSessions: number }> {
    const user = await findAccount(normaliseUsername(rawUsername));

    if (enabled) {
        await db
            .update(users)
            .set({ disabledAt: null, failedAttempts: 0, lockedUntil: null })
            .where(eq(users.id, user.id));
        return { closedSessions: 0 };
    }

    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
    const closed = await db.delete(sessions).where(eq(sessions.userId, user.id));
    return { closedSessions: closed.changes };
}
