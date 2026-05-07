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

  it('contains the expected required items', () => {
    const path = fileURLToPath(new URL('../../src/catalog/bundled.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    const allItems = json.groups.flatMap((g: { items: { id: string }[] }) => g.items);
    const ids = allItems.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual([
      'azure-skills',
      'claude-code-setup',
      'claude-mem',
      'context7',
      'dknet-minimal',
      'drunk-app',
      'gitnexus',
      'graphify',
      'microsoft-docs',
      'microsoft-skills',
      'plugin-dev',
      'rtk',
      'superpowers',
    ]);
  });
});
