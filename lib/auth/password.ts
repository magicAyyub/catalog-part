/**
 * Password hashing, scrypt from node:crypto.
 *
 * scrypt rather than an external bcrypt/argon2 binding on purpose: it is memory
 * hard, it ships with Node, and it adds no native module to build. That matters
 * for a project already carrying `better-sqlite3` into every deployment target.
 *
 * Node runtime only. `proxy.ts` must not import this file.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// `promisify` ne retient que la surcharge sans options, d'où le typage explicite.
const scrypt = promisify(scryptCallback) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
    options: ScryptOptions
) => Promise<Buffer>;

/** Cost parameters, stored inside each hash so they can be raised later. */
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** `scrypt$<N>$<r>$<p>$<salt>$<key>`, salt and key in base64. */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = (await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELISM,
        // scrypt refuse les paramètres coûteux sous la limite mémoire par défaut.
        maxmem: 64 * 1024 * 1024,
    })) as Buffer;

    return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * False on any malformed stored hash rather than throwing, so a corrupted row
 * denies access instead of taking the login route down.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, costRaw, blockSizeRaw, parallelismRaw, saltB64, keyB64] = parts;
    const cost = Number(costRaw);
    const blockSize = Number(blockSizeRaw);
    const parallelism = Number(parallelismRaw);
    if (!cost || !blockSize || !parallelism) return false;

    const expected = Buffer.from(keyB64, "base64");
    if (expected.length === 0) return false;

    let actual: Buffer;
    try {
        actual = (await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
            N: cost,
            r: blockSize,
            p: parallelism,
            maxmem: 64 * 1024 * 1024,
        })) as Buffer;
    } catch {
        return false;
    }

    return timingSafeEqual(actual, expected);
}
