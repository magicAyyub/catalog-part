/**
 * GET  lists the accounts.
 * POST creates one and returns its generated password exactly once.
 *
 * The password is never stored in clear and never retrievable afterwards, so
 * the response is the only chance to read it.
 */

import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/guard";
import { AccountError, createAccount, listAccounts } from "@/lib/auth/accounts";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/logs/request-context";

async function handleGet() {
    const auth = await requireAdminAccess();
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json({ accounts: await listAccounts() });
}

async function handlePost(req: Request) {
    const auth = await requireAdminAccess();
    if (auth instanceof NextResponse) return auth;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    try {
        const { account, generatedPassword } = await createAccount({
            username: String(body.username ?? ""),
            displayName: typeof body.displayName === "string" ? body.displayName : null,
            franchise: typeof body.franchise === "string" ? body.franchise : null,
            role: typeof body.role === "string" ? body.role : undefined,
        });

        logger.info("Account created", {
            action: "account-created",
            userId: auth.id,
            account: account.username,
            role: account.role,
        });

        return NextResponse.json({ account, generatedPassword }, { status: 201 });
    } catch (error: unknown) {
        if (error instanceof AccountError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        logger.warn("Account creation failed", { action: "account-error", userId: auth.id, error });
        return NextResponse.json({ error: "Création impossible." }, { status: 500 });
    }
}

export async function GET() {
    return withRequestContext("admin/users", handleGet);
}

export async function POST(req: Request) {
    return withRequestContext("admin/users", () => handlePost(req));
}
