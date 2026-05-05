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

  it('contains a non-empty groups array', () => {
    const path = fileURLToPath(new URL('../../catalog.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(Array.isArray(json.groups)).toBe(true);
    expect(json.groups.length).toBeGreaterThan(0);
  });
});
