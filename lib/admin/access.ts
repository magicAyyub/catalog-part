/**
 * The account management door. Same mechanism as the trace, different secret.
 *
 * Creating an account hands out a credential to the catalog, so this asks for
 * `ADMIN_PASSWORD` on top of being signed in. Unset, the page stays closed to
 * everyone, which is the safe default.
 *
 * Server only.
 */

import { createGate } from "@/lib/auth/gate";

export const ADMIN_COOKIE = "jbo_admin";

const gate = createGate({
    subject: "admin",
    cookieName: ADMIN_COOKIE,
    passwordEnv: "ADMIN_PASSWORD",
    ttlEnv: "ADMIN_UNLOCK_TTL_HOURS",
    defaultTtlHours: 4,
});

export const adminPasswordConfigured = gate.configured;
export const checkAdminPassword = gate.check;
export const issueAdminCookie = gate.issue;
export const adminCookieOptions = gate.cookieOptions;
export const adminUnlocked = gate.unlocked;
