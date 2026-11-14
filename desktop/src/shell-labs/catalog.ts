// The shell labs the desktop app offers, in the order a learner should meet them. The labs are
// content owned by Edorax Core and served by the Edorax server; the app keeps the last good copy on
// disk so labs still open offline. The catalog can change while the app runs (see refreshShellLabs).
//
// Start-up order (configureShellLabs):
//   1. the on-disk cache (last good version and labs),
//   2. else a development folder (EDORAX_LABS_DIR, or desktop/labs/shell from `pnpm sync:labs`),
//   3. else empty. The installed app has no folder, so a first start with no cache and no network
//      shows no labs until the app is online and signed in.
import fs from 'node:fs';
import path from 'node:path';
import { validateShellLab, type ShellLab, type ShellLabsRefresh } from '../domain/shell-labs';
import type { Result } from '../domain/catalog';
import { loadShellLabs, normalizeShellLab } from './loader';

/** What main.ts needs on top of the renderer's answer: which labs changed, so idle machines can be dropped. */
export interface ShellLabsRefreshDetail extends ShellLabsRefresh {
  changed: string[];
}

/** Asks the server. In the app this is previewClient.request(path, 'GET'). */
export type ShellLabsFetcher = (path: string) => Promise<Result<unknown>>;

export interface ShellLabsConfig {
  /** The cache file (a JSON file in the user data folder). Null means no cache. */
  cacheFile: string | null;
  /** The development folder of labs. Null means none. Used only when there is no usable cache. */
  devDir: string | null;
}

interface State {
  version: string;
  labs: readonly ShellLab[];
  errors: readonly string[];
}

const CACHE_FORMAT = 1;
const EMPTY: State = { version: '', labs: [], errors: [] };

let config: ShellLabsConfig = { cacheFile: null, devDir: null };
let state: State = EMPTY;
let running: Promise<ShellLabsRefreshDetail> | null = null;

/** Checks every lab, skips the invalid ones and names them. One bad lab never hides the others. */
function acceptLabs(raw: unknown[]): { labs: ShellLab[]; errors: string[] } {
  const labs: ShellLab[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    const name = typeof (item as { slug?: unknown } | null)?.slug === 'string' ? (item as ShellLab).slug : `number ${index + 1}`;
    try {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('it is not a lab');
      const lab = normalizeShellLab(structuredClone(item) as ShellLab);
      const problems = validateShellLab(lab);
      if (problems.length) throw new Error(problems.join('; '));
      if (seen.has(lab.slug)) throw new Error('listed twice');
      seen.add(lab.slug);
      labs.push(lab);
    } catch (error) {
      // The validator throws on a lab with missing parts: say so in plain words.
      const why = error instanceof TypeError ? 'it is missing required parts' : error instanceof Error ? error.message : String(error);
      errors.push(`Lab "${name}" was not loaded: ${why}`);
    }
  });
  return { labs, errors };
}

function readCache(file: string): State | null {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { format?: unknown; version?: unknown; labs?: unknown };
    if (saved?.format !== CACHE_FORMAT || typeof saved.version !== 'string' || !saved.version || !Array.isArray(saved.labs)) return null;
    const { labs, errors } = acceptLabs(saved.labs);
    return labs.length ? { version: saved.version, labs, errors } : null;
  } catch {
    // Missing or corrupt: the app goes on without a cache.
    return null;
  }
}

/** Written to a temporary file and renamed, so a crash never leaves half a cache. */
async function writeCache(file: string, next: State) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(temporary, JSON.stringify({ format: CACHE_FORMAT, version: next.version, labs: next.labs }));
    await fs.promises.rename(temporary, file);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    console.error('[shell-labs] Could not save the labs to this computer:', error);
  }
}

/** Sets where the cache and the development folder are and loads the first catalog. Call once at start-up. */
export function configureShellLabs(next: ShellLabsConfig): void {
  config = next;
  running = null;
  const cached = next.cacheFile ? readCache(next.cacheFile) : null;
  if (cached) state = cached;
  else if (next.devDir) {
    const loaded = loadShellLabs(next.devDir);
    state = { version: '', labs: loaded.labs, errors: loaded.errors };
  } else state = EMPTY;
  for (const message of state.errors) console.error(`[shell-labs] ${message}`);
}

export function getShellLabs(): readonly ShellLab[] {
  return state.labs;
}

export function getShellLab(slug: unknown): ShellLab | null {
  return typeof slug === 'string' ? (state.labs.find((lab) => lab.slug === slug) ?? null) : null;
}

/** Plain sentences about labs that could not be loaded. Empty when everything loaded. */
export function shellLabErrors(): readonly string[] {
  return state.errors;
}

/** The version of the labs held now. Empty for labs from the development folder or none at all. */
export function shellLabsVersion(): string {
  return state.version;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(result: { code: string }): string {
  const saved = state.labs.length ? ' Showing the labs saved on this computer.' : '';
  if (result.code === 'AUTH_REQUIRED') return 'Sign in to download labs.';
  if (result.code === 'CONNECTION_ERROR')
    return state.labs.length ? `You are offline.${saved}` : 'You are offline. Connect to the internet to download the labs.';
  return `The labs could not be downloaded right now.${saved}`;
}

async function refresh(fetcher: ShellLabsFetcher): Promise<ShellLabsRefreshDetail> {
  const keep = (ok: boolean, message: string): ShellLabsRefreshDetail => ({ ok, updated: false, count: state.labs.length, message, changed: [] });
  try {
    const head = await fetcher('/api/v1/shell-labs/version');
    if (!head.ok) return keep(false, failure(head));
    const serverVersion = isObject(head.data) && typeof head.data.version === 'string' ? head.data.version : null;
    if (serverVersion === null) return keep(false, failure({ code: 'BAD_ANSWER' }));
    // The server has no labs: never wipe what is saved because of that.
    if (!serverVersion) return keep(true, state.labs.length ? '' : 'The server has no labs yet.');
    if (serverVersion === state.version) return keep(true, '');

    const full = await fetcher('/api/v1/shell-labs');
    if (!full.ok) return keep(false, failure(full));
    if (!isObject(full.data) || typeof full.data.version !== 'string' || !full.data.version || !Array.isArray(full.data.labs))
      return keep(false, failure({ code: 'BAD_ANSWER' }));
    const { labs, errors } = acceptLabs(full.data.labs);
    for (const message of errors) console.error(`[shell-labs] ${message}`);
    if (!labs.length)
      return keep(false, `The downloaded labs could not be used.${state.labs.length ? ' Showing the labs saved on this computer.' : ''}`);

    // A lab changed when its definition is new, different or gone.
    const before = new Map(state.labs.map((lab) => [lab.slug, JSON.stringify(lab)]));
    const after = new Map(labs.map((lab) => [lab.slug, JSON.stringify(lab)]));
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((slug) => before.get(slug) !== after.get(slug));

    state = { version: full.data.version, labs, errors };
    if (config.cacheFile) await writeCache(config.cacheFile, state);
    return { ok: true, updated: true, count: labs.length, message: errors.length ? 'Some labs could not be loaded.' : '', changed };
  } catch (error) {
    console.error('[shell-labs] Refresh failed:', error);
    return keep(false, failure({ code: 'BAD_ANSWER' }));
  }
}

/**
 * Brings the catalog up to date with the server: asks for the version first and downloads the full
 * list only when it differs. Never throws. If the server is unreachable or answers badly, the labs
 * already loaded stay. Calls made while one is running share its answer.
 */
export function refreshShellLabs(fetcher: ShellLabsFetcher): Promise<ShellLabsRefreshDetail> {
  if (!running) {
    const current = refresh(fetcher).finally(() => {
      if (running === current) running = null;
    });
    running = current;
  }
  return running;
}
