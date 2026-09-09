/**
 * PATCH applies one action to one account: `password`, `disable` or `enable`.
 *
 * All three close the account's open sessions where it matters, which is what
 * makes a revocation take effect without waiting for a cookie to expire.
 */

import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/guard";
import {
    AccountError,
    AccountRole,
    resetAccountPassword,
    setAccountEnabled,
    updateAccountRole,
} from "@/lib/auth/accounts";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/logs/request-context";

const ACTIONS = ["password", "disable", "enable", "role"] as const;
type Action = (typeof ACTIONS)[number];

async function handlePatch(req: Request, username: string) {
    const auth = await requireAdminAccess();
    if (auth instanceof NextResponse) return auth;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    const action = body.action;
    if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
        return NextResponse.json(
            { error: `Action inconnue. Attendu : ${ACTIONS.join(", ")}.` },
            { status: 400 }
        );
    }

    const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "127.0.0.1";

    try {
        if (action === "password") {
            const { generatedPassword, closedSessions } = await resetAccountPassword(username);
            logger.info("Account password reset", {
                action: "account-password",
                userId: auth.id,
                adminUsername: auth.username,
                account: username,
                closedSessions,
                ip,
            });
            return NextResponse.json({ generatedPassword, closedSessions });
        }

        if (action === "role") {
            const newRole = body.role as AccountRole;
            const { closedSessions } = await updateAccountRole(username, newRole);
            logger.info("Account role updated", {
                action: "account-role-updated",
                userId: auth.id,
                adminUsername: auth.username,
                account: username,
                role: newRole,
                closedSessions,
                ip,
            });
            return NextResponse.json({ closedSessions, role: newRole });
        }

        const enabled = action === "enable";
        const { closedSessions } = await setAccountEnabled(username, enabled);
        logger.info(enabled ? "Account enabled" : "Account disabled", {
            action: enabled ? "account-enabled" : "account-disabled",
            userId: auth.id,
            adminUsername: auth.username,
            account: username,
            closedSessions,
            ip,
        });
        return NextResponse.json({ closedSessions });
    } catch (error) {
        if (error instanceof AccountError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        logger.warn("Account update failed", { action: "account-error", userId: auth.id, error });
        return NextResponse.json({ error: "Modification impossible." }, { status: 500 });
    }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ username: string }> }) {
    const { username } = await ctx.params;
    return withRequestContext("admin/users/[username]", () => handlePatch(req, username));
}
