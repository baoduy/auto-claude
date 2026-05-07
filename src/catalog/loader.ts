import { CatalogSchema } from './schema.js';
import type { Catalog } from '../types.js';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import bundledJson from './bundled.json' with { type: 'json' };

const REMOTE_URL = 'https://raw.githubusercontent.com/baoduy/auto-claude/main/catalog.json';
const FETCH_TIMEOUT_MS = 5000;
const STALE_CACHE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export interface FetchResult { ok: boolean; body: string }
export interface CacheEntry { json: string; writtenAt: number }

export interface LoaderDeps {
  fetchUrl: (url: string) => Promise<FetchResult>;
  readCache: () => Promise<CacheEntry | null>;
  writeCache: (entry: CacheEntry) => Promise<void>;
  bundled: Catalog;
  now: () => number;
  cacheTtlMs: number;
  refresh?: boolean;
}

export async function loadCatalog(deps: LoaderDeps): Promise<Catalog> {
  const { fetchUrl, readCache, writeCache, bundled, now, cacheTtlMs, refresh } = deps;

  // 1. Try fresh cache (skip if refresh=true)
  if (!refresh) {
    const cached = await readCache().catch(() => null);
    if (cached && now() - cached.writtenAt < cacheTtlMs) {
      const parsed = tryParse(cached.json);
      if (parsed) return parsed;
    }
  }

  // 2. Try network
  try {
    const res = await fetchUrl(REMOTE_URL);
    if (res.ok) {
      const parsed = tryParse(res.body);
      if (parsed) {
        await writeCache({ json: res.body, writtenAt: now() }).catch(() => {});
        return parsed;
      }
    }
  } catch { /* fall through */ }

  // 3. Stale cache (≤ 7d)
  const cached = await readCache().catch(() => null);
  if (cached && now() - cached.writtenAt < STALE_CACHE_MAX_MS) {
    const parsed = tryParse(cached.json);
    if (parsed) return parsed;
  }

  // 4. Bundled fallback
  return bundled;
}

function tryParse(json: string): Catalog | null {
  try {
    const obj = JSON.parse(json);
    return CatalogSchema.parse(obj);
  } catch {
    return null;
  }
}

/** Production deps — wires real fetch + filesystem. */
export function defaultDeps(opts: { refresh?: boolean } = {}): LoaderDeps {
  const cachePath = join(homedir(), '.auto-claude', 'catalog.json');

  return {
    fetchUrl: async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        return { ok: r.ok, body: await r.text() };
      } finally {
        clearTimeout(timer);
      }
    },
    readCache: async () => {
      try {
        const buf = await fs.readFile(cachePath, 'utf-8');
        const stat = await fs.stat(cachePath);
        return { json: buf, writtenAt: stat.mtimeMs };
      } catch { return null; }
    },
    writeCache: async (entry) => {
      await fs.mkdir(join(homedir(), '.auto-claude'), { recursive: true });
      await fs.writeFile(cachePath, entry.json, 'utf-8');
    },
    bundled: bundledJson as Catalog,
    now: () => Date.now(),
    cacheTtlMs: 24 * 60 * 60 * 1000,
    refresh: opts.refresh,
  };
}
