/**
 * Account management for the catalog.
 *
 * There are around seven franchisees and no self-service sign-up, so accounts
 * are created here rather than through a screen nobody would use twice a year.
 *
 * Usage:
 *   pnpm auth:user list
 *   pnpm auth:user create dupont --name "Garage Dupont" --franchise "Lyon Est"
 *   pnpm auth:user create admin --role admin --password "..."
 *   pnpm auth:user password dupont
 *   pnpm auth:user disable dupont
 *   pnpm auth:user enable dupont
 *
 * Without `--password` a strong one is generated and printed once. Passing it
 * on the command line leaves it in the shell history, so prefer the generated
 * form and hand it over out of band.
 *
 * `disable` and `password` both close every open session of the account, which
 * is what makes a revocation take effect immediately.
 */

import { randomUUID, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { sessions, users } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Flags } {
    const positional: string[] = [];
    const flags: Flags = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) {
            positional.push(arg);
            continue;
        }
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
            flags[key] = next;
            i++;
        } else {
            flags[key] = true;
        }
    }

    return { command: positional.shift() ?? "list", positional, flags };
}

function flagString(flags: Flags, key: string): string | undefined {
    const value = flags[key];
    return typeof value === "string" ? value : undefined;
}

/** 24 characters of base64url, roughly 144 bits. */
function generatePassword(): string {
    return randomBytes(18).toString("base64url");
}

function normaliseUsername(raw: string | undefined): string {
    const username = (raw ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        throw new Error(
            "Identifiant invalide. Attendu : 3 à 32 caractères parmi a-z, 0-9, point, tiret, tiret bas."
        );
    }
    return username;
}

async function requireUser(username: string) {
    const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    const user = rows[0];
    if (!user) throw new Error(`Aucun compte "${username}".`);
    return user;
}

async function commandList(): Promise<void> {
    const rows = await db.select().from(users).orderBy(users.username);
    if (rows.length === 0) {
        console.log("Aucun compte. Créez-en un avec `pnpm auth:user create <identifiant>`.");
        return;
    }

    console.log(`${rows.length} compte(s) :\n`);
    for (const user of rows) {
        const state = user.disabledAt ? "désactivé" : "actif";
        const locked = user.lockedUntil && user.lockedUntil > new Date() ? ", bloqué" : "";
        const lastLogin = user.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "jamais";
        console.log(
            `  ${user.username.padEnd(20)} ${user.role.padEnd(6)} ${(user.franchise ?? "-").padEnd(18)} ` +
                `${state}${locked}, dernière connexion : ${lastLogin}`
        );
    }
}

async function commandCreate(positional: string[], flags: Flags): Promise<void> {
    const username = normaliseUsername(positional[0]);

    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing[0]) throw new Error(`Le compte "${username}" existe déjà.`);

    const role = flagString(flags, "role") ?? "user";
    if (role !== "user" && role !== "admin") throw new Error('Rôle invalide. Attendu : "user" ou "admin".');

    const password = flagString(flags, "password") ?? process.env.AUTH_USER_PASSWORD ?? generatePassword();
    const generated = !flagString(flags, "password") && !process.env.AUTH_USER_PASSWORD;

    await db.insert(users).values({
        id: randomUUID(),
        username,
        passwordHash: await hashPassword(password),
        displayName: flagString(flags, "name") ?? null,
        franchise: flagString(flags, "franchise") ?? null,
        role,
        failedAttempts: 0,
        createdAt: new Date(),
    });

    console.log(`Compte "${username}" créé (rôle ${role}).`);
    if (generated) console.log(`Mot de passe : ${password}\nNoté une seule fois, il n'est pas récupérable ensuite.`);
}

async function commandPassword(positional: string[], flags: Flags): Promise<void> {
    const username = normaliseUsername(positional[0]);
    const user = await requireUser(username);

    const password = flagString(flags, "password") ?? process.env.AUTH_USER_PASSWORD ?? generatePassword();
    const generated = !flagString(flags, "password") && !process.env.AUTH_USER_PASSWORD;

    await db
        .update(users)
        .set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
    const closed = await db.delete(sessions).where(eq(sessions.userId, user.id));

    console.log(`Mot de passe de "${username}" réinitialisé, ${closed.changes} session(s) fermée(s).`);
    if (generated) console.log(`Mot de passe : ${password}`);
}

async function commandDisable(positional: string[]): Promise<void> {
    const username = normaliseUsername(positional[0]);
    const user = await requireUser(username);

    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
    const closed = await db.delete(sessions).where(eq(sessions.userId, user.id));

    console.log(`Compte "${username}" désactivé, ${closed.changes} session(s) fermée(s).`);
}

async function commandEnable(positional: string[]): Promise<void> {
    const username = normaliseUsername(positional[0]);
    const user = await requireUser(username);

    await db
        .update(users)
        .set({ disabledAt: null, failedAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));

    console.log(`Compte "${username}" réactivé.`);
}

async function main(): Promise<void> {
    const { command, positional, flags } = parseArgs(process.argv.slice(2));

    switch (command) {
        case "list":
            return commandList();
        case "create":
            return commandCreate(positional, flags);
        case "password":
            return commandPassword(positional, flags);
        case "disable":
            return commandDisable(positional);
        case "enable":
            return commandEnable(positional);
        default:
            throw new Error(`Commande inconnue "${command}". Attendu : list, create, password, disable, enable.`);
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
