/**
 * La porte d'administration, unique pour la trace et pour les comptes.
 *
 * Être connecté comme franchisé ne suffit pas : la trace montre des plaques et
 * des appels facturés, la gestion des comptes distribue des identifiants. Les
 * deux demandent `ADMIN_PASSWORD`, tenu hors de la table des comptes pour que
 * l'accès ne dépende jamais d'un indicateur de rôle posé par mégarde.
 *
 * Un seul secret et un seul cookie : ouvrir une page ouvre l'autre. Sans la
 * variable, tout reste fermé, ce qui est le défaut sûr.
 *
 * Serveur uniquement.
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
