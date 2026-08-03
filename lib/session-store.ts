import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export type SupplierName = 'preference' | 'exadis';

export const ALL_SUPPLIER_NAMES: readonly SupplierName[] = [
  'preference',
  'exadis',
] as const;

export interface PreferenceSupplierSession {
  supplier: 'preference';
  cookies: string;
  viewState?: string;
  viewStateGenerator?: string;
  eventValidation?: string;
  cataloguePageUrl?: string;
  loggedInAt: number;
  lastActivity: number;
  userAgent: string;
}

export interface ExadisSupplierSession {
  supplier: 'exadis';
  cookies: string;
  accessToken: string;
  loggedInAt: number;
  lastActivity: number;
  userAgent: string;
}

export type SupplierSession = PreferenceSupplierSession | ExadisSupplierSession;

type StoreFile = Partial<Record<SupplierName, SupplierSession>>;

const CACHE_DIR = join(process.cwd(), '.cache');
const STORE_PATH = join(CACHE_DIR, 'supplier-sessions.json');

function ttlMs(): number {
  const minutes = parseInt(process.env.SESSION_TTL_MINUTES ?? '25', 10);
  if (Number.isNaN(minutes) || minutes <= 0) return 25 * 60 * 1000;
  return minutes * 60 * 1000;
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || typeof parsed !== 'object') return {};
    if (parsed.exadis) {
      const ex = parsed.exadis as Partial<ExadisSupplierSession>;
      if (typeof ex.accessToken !== 'string' || typeof ex.cookies !== 'string') {
        delete parsed.exadis;
      }
    }
    return parsed;
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return {};
    console.warn('[session-store] Corrupted supplier-sessions.json file — resetting session cache.');
    return {};
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

export async function getSession(
  supplier: 'preference'
): Promise<PreferenceSupplierSession | null>;
export async function getSession(
  supplier: 'exadis'
): Promise<ExadisSupplierSession | null>;
export async function getSession(supplier: SupplierName): Promise<SupplierSession | null> {
  const store = await readStore();
  const s = store[supplier];
  return s ?? null;
}

export async function setSession(
  supplier: 'preference',
  session: PreferenceSupplierSession
): Promise<void>;
export async function setSession(
  supplier: 'exadis',
  session: ExadisSupplierSession
): Promise<void>;
export async function setSession(
  supplier: SupplierName,
  session: SupplierSession
): Promise<void> {
  if (session.supplier !== supplier) {
    throw new Error(
      `setSession: key "${supplier}" does not match session.supplier "${session.supplier}"`
    );
  }
  const store = await readStore();
  store[supplier] = session;
  await writeStore(store);
}

export async function updateActivity(supplier: SupplierName): Promise<void> {
  const store = await readStore();
  const s = store[supplier];
  if (!s) return;
  s.lastActivity = Date.now();
  await writeStore(store);
}

export async function clearSession(supplier: SupplierName): Promise<void> {
  const store = await readStore();
  delete store[supplier];
  await writeStore(store);
}

export async function clearAllSupplierSessions(): Promise<void> {
  await writeStore({});
}

export async function isExpired(session: SupplierSession): Promise<boolean> {
  return Date.now() - session.lastActivity > ttlMs();
}

export function getSessionExpiresAt(session: SupplierSession): number {
  return session.lastActivity + ttlMs();
}
