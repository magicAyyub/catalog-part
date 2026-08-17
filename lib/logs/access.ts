/**
 * The trace page's door. The mechanism lives in `lib/auth/gate.ts`; this file
 * only says which secret and which cookie.
 *
 * Short lived on purpose: this is a debugging door, not a session.
 *
 * Server only.
 */

import { createGate } from "@/lib/auth/gate";

export const LOGS_COOKIE = "jbo_logs";

const gate = createGate({
    subject: "logs",
    cookieName: LOGS_COOKIE,
    passwordEnv: "LOGS_PASSWORD",
    ttlEnv: "LOGS_UNLOCK_TTL_HOURS",
    defaultTtlHours: 12,
});

export const logsPasswordConfigured = gate.configured;
export const checkLogsPassword = gate.check;
export const issueLogsCookie = gate.issue;
export const logsCookieOptions = gate.cookieOptions;
export const logsUnlocked = gate.unlocked;
