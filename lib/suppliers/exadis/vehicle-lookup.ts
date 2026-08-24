/**
 * Traduction plaque vers K-Type par le portail Exadis, et rien d'autre.
 *
 * Le K-Type sort d'une seule requête, `searchVehiculeByImmatOrVin`, précédée
 * de quatre requêtes de connexion mutualisées entre les recherches.
 *
 * La frontière est volontaire : seul le K-Type vient d'un fournisseur, jamais
 * un prix, un stock ou un article.
 *
 * Serveur uniquement, les identifiants ne doivent jamais atteindre le bundle.
 */

import { logger } from "@/lib/logger";
import {
    EXADIS_PERMUTATIONS,
    EXADIS_URLS,
    EXADIS_USER_AGENT,
    GET_CURRENT_USER_BODY,
    GET_LOGIN_INIT_PARAM_BODY,
    LOGIN_BODY_TPL,
    SEARCH_VEHICULE_BODY_TPL,
} from "./templates";
import {
    buildHeaders,
    extractExceptionName,
    extractStringTable,
    mergeCookies,
} from "./gwt-codec";
import { exadisRequestFollowing, type ExadisResponse } from "./transport";
import { normalizePlate, parseVehicleIdentity, type ExadisVehicle } from "./vehicle-parser";

const MODULE_BASE = "https://ecat.exadis.fr/ecatvl/ecat_vl/";
const SESSION_TTL_MS = Number(process.env.EXADIS_SESSION_TTL_MINUTES ?? "20") * 60_000;
const REQUEST_TIMEOUT_MS = Number(process.env.EXADIS_TIMEOUT_MS ?? "20000");

export class ExadisLookupError extends Error {
    constructor(
        message: string,
        readonly code: "no_credentials" | "auth_failed" | "not_found" | "transport"
    ) {
        super(message);
        this.name = "ExadisLookupError";
    }
}

interface Session {
    accessToken: string;
    cookies: string;
    expiresAt: number;
}

/** Une session par processus : la connexion coûte quatre requêtes. */
let current: Promise<Session> | null = null;
let currentExpiry = 0;

function credentials(): { username: string; password: string } {
    const username = process.env.EXADIS_USERNAME;
    const password = process.env.EXADIS_PASSWORD;
    if (!username || !password) {
        throw new ExadisLookupError(
            "EXADIS_USERNAME et EXADIS_PASSWORD absents de .env.",
            "no_credentials"
        );
    }
    return { username, password };
}

async function post(url: string, body: string, headers: Record<string, string>): Promise<ExadisResponse> {
    return exadisRequestFollowing(url, { method: "POST", headers, body, timeoutMs: REQUEST_TIMEOUT_MS });
}

async function login(): Promise<Session> {
    const { username, password } = credentials();
    const started = Date.now();

    const loginResponse = await post(
        EXADIS_URLS.PORTAL_SVC,
        LOGIN_BODY_TPL.replace("{USERNAME}", username).replace("{PASSWORD}", password),
        buildHeaders({
            permutation: EXADIS_PERMUTATIONS.PORTAL,
            moduleBase: "https://ecat.exadis.fr/ecat_portail/",
            referer: "https://ecat.exadis.fr/index.html",
        })
    );
    if (loginResponse.status !== 200) {
        throw new ExadisLookupError(`Connexion Exadis refusée (HTTP ${loginResponse.status}).`, "auth_failed");
    }

    let cookies = mergeCookies("", loginResponse.setCookie);

    const accessToken = extractStringTable(loginResponse.body)?.find((value) =>
        /^[a-z0-9]{35,45}$/.test(value)
    );
    if (!accessToken) {
        throw new ExadisLookupError("Connexion Exadis sans jeton d'accès exploitable.", "auth_failed");
    }

    // Lie le jeton à la session serveur, sinon les appels suivants sont rejetés.
    const ssoResponse = await exadisRequestFollowing(
        `${EXADIS_URLS.SSO_EXCHANGE}?access_token=${accessToken}`,
        {
            headers: {
                "User-Agent": EXADIS_USER_AGENT,
                Cookie: cookies,
                Referer: "https://ecat.exadis.fr/index.html",
            },
            timeoutMs: REQUEST_TIMEOUT_MS,
            follow: 5,
        }
    );
    if (ssoResponse.status !== 200) {
        throw new ExadisLookupError(`Échange SSO Exadis en échec (HTTP ${ssoResponse.status}).`, "auth_failed");
    }
    cookies = mergeCookies(cookies, ssoResponse.setCookie);

    const referer = `https://ecat.exadis.fr/ecatvl/?access_token=${accessToken}`;

    for (const [path, body] of [
        ["ecatAuthSvc", GET_CURRENT_USER_BODY],
        ["ecatSvc", GET_LOGIN_INIT_PARAM_BODY],
    ] as const) {
        const response = await post(
            `${EXADIS_URLS.ECAT_BASE}/${path}`,
            body,
            buildHeaders({
                permutation: EXADIS_PERMUTATIONS.ECATVL,
                moduleBase: MODULE_BASE,
                referer,
                accessToken,
                cookies,
            })
        );
        if (response.status !== 200) {
            throw new ExadisLookupError(`Initialisation Exadis en échec sur ${path}.`, "auth_failed");
        }
        cookies = mergeCookies(cookies, response.setCookie);
    }

    logger.info("Exadis session opened", {
        module: "exadis",
        action: "exadis_login",
        durationMs: Date.now() - started,
    });

    return { accessToken, cookies, expiresAt: Date.now() + SESSION_TTL_MS };
}

async function session(force = false): Promise<Session> {
    if (force || !current || Date.now() >= currentExpiry) {
        currentExpiry = Date.now() + SESSION_TTL_MS;
        current = login().catch((error: unknown) => {
            current = null;
            currentExpiry = 0;
            throw error;
        });
    }
    return current;
}

async function requestVehicle(plate: string, active: Session): Promise<ExadisResponse> {
    return post(
        `${EXADIS_URLS.ECAT_BASE}/ecatVSvc`,
        SEARCH_VEHICULE_BODY_TPL.replace("{PLATE}", plate),
        buildHeaders({
            permutation: EXADIS_PERMUTATIONS.ECATVL,
            moduleBase: MODULE_BASE,
            referer: `https://ecat.exadis.fr/ecatvl/?access_token=${active.accessToken}`,
            accessToken: active.accessToken,
            cookies: active.cookies,
        })
    );
}

/**
 * Session perdue côté portail.
 *
 * Il ne rend ni 401 ni 403 mais une redirection vers son SSO, mesurée en 501
 * sur un jeton invalide. Les deux statuts restent testés par prudence.
 */
function sessionExpired(response: ExadisResponse): boolean {
    return (
        response.status === 401 ||
        response.status === 403 ||
        response.body.includes("SSO_REDIRECT_URL")
    );
}

/**
 * Identité véhicule d'une plaque : le kType toujours, les libellés quand ils
 * ont pu être lus. Relance une fois si la session a expiré.
 */
export async function lookupVehicleByPlate(rawPlate: string): Promise<ExadisVehicle> {
    const plate = normalizePlate(rawPlate);
    const started = Date.now();

    let response: ExadisResponse;
    let active = await session();

    try {
        response = await requestVehicle(plate, active);
        if (sessionExpired(response)) {
            logger.info("Exadis session expired, logging in again", {
                module: "exadis",
                action: "session_retry",
                supplier: "exadis",
            });
            active = await session(true);
            response = await requestVehicle(plate, active);
        }
    } catch (error) {
        if (error instanceof ExadisLookupError) throw error;
        logger.warn("Exadis vehicle lookup transport error", {
            module: "exadis",
            action: "exadis_error",
            plate,
            durationMs: Date.now() - started,
            error,
        });
        throw new ExadisLookupError("Portail Exadis injoignable.", "transport");
    }

    if (response.status !== 200) {
        throw new ExadisLookupError(`Recherche véhicule Exadis en échec (HTTP ${response.status}).`, "transport");
    }

    // Une plaque inconnue arrive en exception Java dans un 200. Toute autre
    // exception est une panne de leur côté, pas une plaque absente.
    const thrown = extractExceptionName(response.body);
    if (thrown) {
        if (thrown.endsWith("VehiculeNotFoundException")) {
            throw new ExadisLookupError(`Plaque ${plate} inconnue chez Exadis.`, "not_found");
        }
        throw new ExadisLookupError(`Exadis a rejeté la recherche (${thrown}).`, "transport");
    }

    const stringTable = extractStringTable(response.body);
    if (!stringTable || stringTable.length === 0) {
        throw new ExadisLookupError("Réponse Exadis illisible.", "transport");
    }

    const vehicle = parseVehicleIdentity(stringTable, plate);
    if (!vehicle) {
        throw new ExadisLookupError(`Aucun K-Type dans la réponse Exadis pour ${plate}.`, "transport");
    }

    logger.info("Plate translated to K-Type by Exadis", {
        module: "exadis",
        action: "exadis_ktype",
        plate,
        kType: vehicle.kType,
        brand: vehicle.brand || null,
        model: vehicle.model || null,
        durationMs: Date.now() - started,
    });

    return vehicle;
}

export function exadisConfigured(): boolean {
    return Boolean(process.env.EXADIS_USERNAME && process.env.EXADIS_PASSWORD);
}
