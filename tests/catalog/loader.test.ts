import { describe, it, expect, vi } from 'vitest';
import { loadCatalog, type LoaderDeps } from '../../src/catalog/loader.js';
import bundled from '../../catalog.json' with { type: 'json' };

const validJson = JSON.stringify(bundled);

function makeDeps(overrides: Partial<LoaderDeps> = {}): LoaderDeps {
  return {
    fetchUrl: async () => ({ ok: true, body: validJson }),
    readCache: async () => null,
    writeCache: async () => {},
    bundled: bundled as never,
    now: () => new Date('2026-05-05T00:00:00Z').getTime(),
    cacheTtlMs: 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('loadCatalog', () => {
  it('returns remote catalog and writes cache on success', async () => {
    const writeCache = vi.fn(async () => {});
    const cat = await loadCatalog(makeDeps({ writeCache }));
    expect(cat.items).toHaveLength(11);
    expect(writeCache).toHaveBeenCalledOnce();
  });

  it('falls back to fresh cache when network fails', async () => {
    const cat = await loadCatalog(makeDeps({
      fetchUrl: async () => { throw new Error('offline'); },
      readCache: async () => ({
        json: validJson,
        writtenAt: new Date('2026-05-04T23:00:00Z').getTime(),
      }),
    }));
    expect(cat.items).toHaveLength(11);
  });

  it('falls back to bundled when network fails and cache is stale', async () => {
    const cat = await loadCatalog(makeDeps({
      fetchUrl: async () => { throw new Error('offline'); },
      readCache: async () => ({
        json: validJson,
        writtenAt: new Date('2026-04-25T00:00:00Z').getTime(), // >7d old
      }),
    }));
    expect(cat.items).toHaveLength(11);
  });

  it('falls back to bundled when remote returns malformed json', async () => {
    const cat = await loadCatalog(makeDeps({
      fetchUrl: async () => ({ ok: true, body: '{"not":"valid"}' }),
      readCache: async () => null,
    }));
    expect(cat.items).toHaveLength(11);
  });

  it('refresh=true bypasses cache', async () => {
    const fetchUrl = vi.fn(async () => ({ ok: true, body: validJson }));
    await loadCatalog({ ...makeDeps({ fetchUrl }), refresh: true });
    expect(fetchUrl).toHaveBeenCalledOnce();
  });
});
