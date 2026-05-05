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

describe('core-plugins group', () => {
  const catalogs = [
    { label: 'catalog.json',              path: '../../catalog.json' },
    { label: 'src/catalog/bundled.json',  path: '../../src/catalog/bundled.json' },
  ];

  for (const { label, path } of catalogs) {
    describe(label, () => {
      it('has core-plugins group named "Core plugins & skill packs"', () => {
        const json = loadCatalog(path);
        const group = json.groups.find((g: { id: string }) => g.id === 'core-plugins');
        expect(group, 'core-plugins group must exist').toBeDefined();
        expect(group.name).toBe('Core plugins & skill packs');
      });

      it('has microsoft-skills entry in core-plugins', () => {
        const json = loadCatalog(path);
        const group = json.groups.find((g: { id: string }) => g.id === 'core-plugins');
        const item = group?.items.find((i: { id: string }) => i.id === 'microsoft-skills');
        expect(item, 'microsoft-skills item must exist in core-plugins').toBeDefined();
        expect(item.kind).toBe('plugin');
        expect(item.default).toBeFalsy();
        expect(item.homepage).toBe('https://github.com/microsoft/skills');
      });

      it('has azure-skills entry in core-plugins', () => {
        const json = loadCatalog(path);
        const group = json.groups.find((g: { id: string }) => g.id === 'core-plugins');
        const item = group?.items.find((i: { id: string }) => i.id === 'azure-skills');
        expect(item, 'azure-skills item must exist in core-plugins').toBeDefined();
        expect(item.kind).toBe('plugin');
        expect(item.default).toBeFalsy();
        expect(item.homepage).toBe('https://github.com/microsoft/azure-skills');
      });
    });
  }
});

describe('mcp-servers group', () => {
  it('contains an mcp-servers pick-many group', () => {
    const json = loadCatalog('../../catalog.json');
    const group = json.groups.find((g: any) => g.id === 'mcp-servers');
    expect(group).toBeDefined();
    expect(group.kind).toBe('pick-many');
    expect(group.name).toBe('MCP servers (project)');
  });

  it('seeds context7-mcp and microsoft-learn-mcp', () => {
    const json = loadCatalog('../../catalog.json');
    const group = json.groups.find((g: any) => g.id === 'mcp-servers')!;
    const c7 = group.items.find((i: any) => i.id === 'context7-mcp');
    const ms = group.items.find((i: any) => i.id === 'microsoft-learn-mcp');
    expect(c7).toBeDefined();
    expect(ms).toBeDefined();
    expect(c7.kind).toBe('mcp');
    expect(ms.kind).toBe('mcp');
    expect(typeof c7.mcpKey).toBe('string');
    expect(typeof ms.mcpKey).toBe('string');
  });
});
