import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../src/catalog/schema.js';

function loadCatalog(relativePath: string) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('root catalog.json', () => {
  it('parses against the schema', () => {
    const json = loadCatalog('../../catalog.json');
    expect(() => CatalogSchema.parse(json)).not.toThrow();
  });

  it('contains a non-empty groups array', () => {
    const json = loadCatalog('../../catalog.json');
    expect(Array.isArray(json.groups)).toBe(true);
    expect(json.groups.length).toBeGreaterThan(0);
  });
});

describe('core-plugins group — rename', () => {
  const catalogs = [
    { label: 'catalog.json',             path: '../../catalog.json' },
    { label: 'src/catalog/bundled.json', path: '../../src/catalog/bundled.json' },
  ];

  for (const { label, path } of catalogs) {
    describe(label, () => {
      it('has core-plugins group named "Core plugins & skill packs"', () => {
        const json = loadCatalog(path);
        const group = json.groups.find((g: { id: string }) => g.id === 'core-plugins');
        expect(group, 'core-plugins group must exist').toBeDefined();
        expect(group.name).toBe('Core plugins & skill packs');
      });
    });
  }
});
