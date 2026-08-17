/**
 * Opens account management for one browser.
 *
 * Already behind `requireUser`, so only a signed-in franchisee can even try.
 * The attempt counter is per account and in memory, which is enough for a
 * secret shared between one or two people on a single process.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
    adminCookieOptions,
    adminPasswordConfigured,
    checkAdminPassword,
    issueAdminCookie,
} from "@/lib/admin/access";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/logs/request-context";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; until: number }>();

async function handlePost(req: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    if (!adminPasswordConfigured()) {
        return NextResponse.json(
            { error: "ADMIN_PASSWORD n'est pas défini dans .env : la gestion des comptes est fermée." },
            { status: 503 }
        );
    }

    const record = attempts.get(auth.id);
    if (record && record.until > Date.now()) {
        const minutes = Math.ceil((record.until - Date.now()) / 60000);
        return NextResponse.json(
            { error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.` },
            { status: 429 }
        );
    }

    let password: unknown;
    try {
        ({ password } = await req.json());
    } catch {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    if (typeof password !== "string" || !password) {
        return NextResponse.json({ error: "Mot de passe requis." }, { status: 400 });
    }

    if (!checkAdminPassword(password)) {
        const count = (record?.count ?? 0) + 1;
        attempts.set(auth.id, {
            count,
            until: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
        });
        logger.warn("Rejected accounts unlock", {
            action: "admin-unlock-failed",
            userId: auth.id,
            count,
        });
        return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
    }

    attempts.delete(auth.id);
    logger.info("Accounts unlocked", { action: "admin-unlock-success", userId: auth.id });

    const { value, expiresAt } = await issueAdminCookie();
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ ...adminCookieOptions(expiresAt), value });
    return res;
}

export async function POST(req: Request) {
    return withRequestContext("admin/unlock", () => handlePost(req));
}
