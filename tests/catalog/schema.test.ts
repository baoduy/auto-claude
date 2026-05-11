import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '../../src/catalog/schema.js';

const baseItem = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: 'x',
  kind: 'tool',
  defaultScope: 'global',
  detect: { command: 'true' },
  install: { command: 'true' },
  ...extra,
});

const validCatalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    { id: 'g1', name: 'G1', kind: 'pick-many', items: [baseItem('a'), baseItem('b')] },
    { id: 'g2', name: 'G2', kind: 'pick-one', items: [baseItem('c'), baseItem('d')] },
  ],
};

describe('CatalogSchema v2', () => {
  it('accepts a valid v2 catalog', () => {
    expect(() => CatalogSchema.parse(validCatalog)).not.toThrow();
  });

  it('rejects v1 (no groups)', () => {
    const v1 = { version: 1, updatedAt: '2026-05-05', items: [baseItem('a')] };
    expect(() => CatalogSchema.parse(v1)).toThrow();
  });

  it('rejects duplicate item ids across groups', () => {
    const bad = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'g1', name: 'G1', kind: 'pick-many', items: [baseItem('dup')] },
        { id: 'g2', name: 'G2', kind: 'pick-many', items: [baseItem('dup')] },
      ],
    };
    expect(() => CatalogSchema.parse(bad)).toThrow(/duplicate item id/i);
  });

  it('rejects duplicate group ids', () => {
    const bad = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'same', name: 'A', kind: 'pick-many', items: [baseItem('a')] },
        { id: 'same', name: 'B', kind: 'pick-many', items: [baseItem('b')] },
      ],
    };
    expect(() => CatalogSchema.parse(bad)).toThrow(/duplicate group id/i);
  });

});

import { CatalogItemSchema } from '../../src/catalog/schema.js';

describe('mcp item schema', () => {
  const valid = {
    id: 'context7-mcp',
    name: 'context7',
    description: 'Context7 MCP server',
    kind: 'mcp',
    mcpKey: 'context7',
    mcpServer: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  };

  it('accepts a valid mcp item', () => {
    expect(() => CatalogItemSchema.parse(valid)).not.toThrow();
  });

  it('rejects an mcp item missing mcpKey', () => {
    const { mcpKey: _omit, ...bad } = valid;
    expect(() => CatalogItemSchema.parse(bad)).toThrow();
  });

  it('rejects an mcp item with empty mcpServer.command', () => {
    expect(() => CatalogItemSchema.parse({ ...valid, mcpServer: { command: '' } })).toThrow();
  });

  it('rejects duplicate mcpKey across items', () => {
    const cat = {
      version: 2 as const,
      updatedAt: '2026-05-05',
      groups: [{
        id: 'g', name: 'g', kind: 'pick-many' as const,
        items: [valid, { ...valid, id: 'context7-mcp-2' }],
      }],
    };
    expect(() => CatalogSchema.parse(cat)).toThrow(/duplicate mcpKey/);
  });
});

describe('CatalogGroup.page', () => {
  const baseGroup = {
    id: 'g1', name: 'G', kind: 'pick-many' as const,
    items: [{
      id: 'i1', name: 'I', description: '', kind: 'tool' as const,
      defaultScope: 'global' as const,
      detect: { command: 'true' }, install: { command: 'true' },
    }],
  };

  it('accepts groups without a page field (back-compat)', () => {
    const r = CatalogSchema.safeParse({ version: 2, updatedAt: '2026-05-07', groups: [baseGroup] });
    expect(r.success).toBe(true);
  });

  it('accepts a valid page override', () => {
    const r = CatalogSchema.safeParse({
      version: 2, updatedAt: '2026-05-07',
      groups: [{ ...baseGroup, page: 'plugin' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid page value', () => {
    const r = CatalogSchema.safeParse({
      version: 2, updatedAt: '2026-05-07',
      groups: [{ ...baseGroup, page: 'banana' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('disabled flag', () => {
  it('accepts disabled:true on item', () => {
    const cat = {
      version: 2,
      updatedAt: '2026-05-11',
      groups: [{
        id: 'g1', name: 'g1', kind: 'pick-many',
        items: [{
          id: 'a', name: 'a', description: '', kind: 'tool',
          defaultScope: 'global',
          detect: { command: 'a --v' },
          install: { command: 'true' },
          disabled: true,
        }],
      }],
    };
    expect(() => CatalogSchema.parse(cat)).not.toThrow();
  });

  it('accepts disabled:true on group', () => {
    const cat = {
      version: 2,
      updatedAt: '2026-05-11',
      groups: [{
        id: 'g1', name: 'g1', kind: 'pick-many', disabled: true,
        items: [{
          id: 'a', name: 'a', description: '', kind: 'tool',
          defaultScope: 'global',
          detect: { command: 'a --v' },
          install: { command: 'true' },
        }],
      }],
    };
    expect(() => CatalogSchema.parse(cat)).not.toThrow();
  });
});
