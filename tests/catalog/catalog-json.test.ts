import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('root catalog.json', () => {
  it('parses against the schema', () => {
    const path = fileURLToPath(new URL('../../catalog.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(() => CatalogSchema.parse(json)).not.toThrow();
  });

  it('contains a non-empty items array', () => {
    const path = fileURLToPath(new URL('../../catalog.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBeGreaterThan(0);
  });
});
