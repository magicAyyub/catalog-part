/**
 * Account management from the command line.
 *
 * The same operations are available on `/comptes`, behind `ADMIN_PASSWORD`.
 * This stays because it is the only way to create the first account, before
 * anyone can sign in to reach that page.
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
 */

import {
    createAccount,
    listAccounts,
    resetAccountPassword,
    setAccountEnabled,
} from "../lib/auth/accounts";

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

function password(flags: Flags): string | undefined {
    return flagString(flags, "password") ?? process.env.AUTH_USER_PASSWORD;
}

async function commandList(): Promise<void> {
    const accounts = await listAccounts();
    if (accounts.length === 0) {
        console.log("Aucun compte. Créez-en un avec `pnpm auth:user create <identifiant>`.");
        return;
    }

    console.log(`${accounts.length} compte(s) :\n`);
    for (const account of accounts) {
        const state = account.disabled ? "désactivé" : "actif";
        const locked = account.lockedUntil && account.lockedUntil > new Date() ? ", bloqué" : "";
        const lastLogin = account.lastLoginAt
            ? account.lastLoginAt.toISOString().slice(0, 16).replace("T", " ")
            : "jamais";
        console.log(
            `  ${account.username.padEnd(20)} ${account.role.padEnd(6)} ${(account.franchise ?? "-").padEnd(18)} ` +
                `${state}${locked}, dernière connexion : ${lastLogin}`
        );
    }
}

async function commandCreate(positional: string[], flags: Flags): Promise<void> {
    const { account, generatedPassword } = await createAccount({
        username: positional[0],
        displayName: flagString(flags, "name"),
        franchise: flagString(flags, "franchise"),
        role: flagString(flags, "role"),
        password: password(flags),
    });

    console.log(`Compte "${account.username}" créé (rôle ${account.role}).`);
    if (generatedPassword) {
        console.log(
            `Mot de passe : ${generatedPassword}\nNoté une seule fois, il n'est pas récupérable ensuite.`
        );
    }
}

async function commandPassword(positional: string[], flags: Flags): Promise<void> {
    const { generatedPassword, closedSessions } = await resetAccountPassword(
        positional[0],
        password(flags)
    );

    console.log(`Mot de passe réinitialisé, ${closedSessions} session(s) fermée(s).`);
    if (generatedPassword) console.log(`Mot de passe : ${generatedPassword}`);
}

async function commandDisable(positional: string[]): Promise<void> {
    const { closedSessions } = await setAccountEnabled(positional[0], false);
    console.log(`Compte désactivé, ${closedSessions} session(s) fermée(s).`);
}

async function commandEnable(positional: string[]): Promise<void> {
    await setAccountEnabled(positional[0], true);
    console.log("Compte réactivé.");
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
            throw new Error(
                `Commande inconnue "${command}". Attendu : list, create, password, disable, enable.`
            );
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
