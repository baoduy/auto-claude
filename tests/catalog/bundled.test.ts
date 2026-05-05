import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('bundled catalog', () => {
  it('parses against the schema', () => {
    const path = fileURLToPath(new URL('../../src/catalog/bundled.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(() => CatalogSchema.parse(json)).not.toThrow();
  });

  it('contains the four required items', () => {
    const path = fileURLToPath(new URL('../../src/catalog/bundled.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    const ids = json.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(['claude-code-setup', 'claude-mem', 'rtk', 'superpowers']);
  });
});
