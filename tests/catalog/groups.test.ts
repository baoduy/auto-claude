import { describe, it, expect } from 'vitest';
import { flattenItems, groupByItemId, dominantKind, pageOf, activeKinds, groupsForKind, findDefaultConflicts } from '../../src/catalog/groups.js';
import type { Catalog, CatalogGroup, CatalogItem } from '../../src/types.js';

const tool = (id: string): CatalogItem => ({
  id, name: id, description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'true' }, install: { command: 'true' },
});
const plugin = (id: string): CatalogItem => ({
  id, name: id, description: '', kind: 'plugin', defaultScope: 'global',
  detect: { command: 'true' }, install: { command: 'true' },
});
const mcp = (id: string): CatalogItem => ({
  id, name: id, description: '', kind: 'mcp',
  mcpKey: id, mcpServer: { command: 'x' },
});
const group = (id: string, items: CatalogItem[], extras: Partial<CatalogGroup> = {}): CatalogGroup => ({
  id, name: id, kind: 'pick-many', items, ...extras,
});

const cat: Catalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    {
      id: 'g1', name: 'G1', kind: 'pick-many', items: [
        { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ],
    },
    {
      id: 'g2', name: 'G2', kind: 'pick-one', items: [
        { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
        { id: 'c', name: 'C', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ],
    },
  ],
};

describe('flattenItems', () => {
  it('returns all items in declared order', () => {
    expect(flattenItems(cat).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('groupByItemId', () => {
  it('maps each item id to its group', () => {
    const m = groupByItemId(cat);
    expect(m.get('a')?.id).toBe('g1');
    expect(m.get('b')?.id).toBe('g2');
    expect(m.get('c')?.id).toBe('g2');
    expect(m.get('zz')).toBeUndefined();
  });
});

describe('dominantKind', () => {
  it('returns the only kind when group is pure', () => {
    expect(dominantKind(group('g', [tool('a'), tool('b')]))).toBe('tool');
  });
  it('returns the majority kind for mixed groups', () => {
    expect(dominantKind(group('g', [plugin('a'), plugin('b'), tool('c')]))).toBe('plugin');
  });
  it('breaks ties tool > plugin > mcp', () => {
    expect(dominantKind(group('g', [plugin('a'), tool('b')]))).toBe('tool');
    expect(dominantKind(group('g', [plugin('a'), mcp('b')]))).toBe('plugin');
    expect(dominantKind(group('g', [tool('a'), mcp('b')]))).toBe('tool');
  });
});

describe('pageOf', () => {
  it('returns explicit page when set', () => {
    const g = group('g', [tool('a')], { page: 'plugin' });
    expect(pageOf(g)).toBe('plugin');
  });
  it('falls back to dominantKind when page is unset', () => {
    expect(pageOf(group('g', [plugin('a'), tool('b')]))).toBe('tool');
  });
});

describe('activeKinds', () => {
  const cat = (groups: CatalogGroup[]): Catalog => ({ version: 2, updatedAt: '2026-05-07', groups });

  it('returns kinds in canonical order tool > plugin > mcp', () => {
    const c = cat([
      group('p', [plugin('p1')]),
      group('m', [mcp('m1')]),
      group('t', [tool('t1')]),
    ]);
    expect(activeKinds(c, '/repo')).toEqual(['tool', 'plugin', 'mcp']);
  });

  it('omits kinds with no assigned groups', () => {
    const c = cat([group('p', [plugin('p1')])]);
    expect(activeKinds(c, '/repo')).toEqual(['plugin']);
  });

  it('drops mcp when repoRoot is null', () => {
    const c = cat([group('m', [mcp('m1')]), group('t', [tool('t1')])]);
    expect(activeKinds(c, null)).toEqual(['tool']);
  });

  it('respects explicit page overrides', () => {
    const c = cat([
      group('mixed', [plugin('a'), tool('b')], { page: 'plugin' }),
    ]);
    expect(activeKinds(c, '/repo')).toEqual(['plugin']);
  });
});

describe('groupsForKind', () => {
  it('returns only groups whose page resolves to the requested kind', () => {
    const c: Catalog = {
      version: 2, updatedAt: '2026-05-07',
      groups: [
        group('g1', [tool('a')]),
        group('g2', [plugin('b')]),
        group('g3', [tool('c'), plugin('d')], { page: 'plugin' }),
      ],
    };
    expect(groupsForKind(c, 'tool').map(g => g.id)).toEqual(['g1']);
    expect(groupsForKind(c, 'plugin').map(g => g.id)).toEqual(['g2', 'g3']);
  });
});

describe('findDefaultConflicts', () => {
  const mkTool = (id: string, isDefault = false, withUninstall = true): CatalogItem => ({
    id, name: id, description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: 'true' }, install: { command: `install-${id}` },
    ...(withUninstall ? { uninstall: { command: `uninstall-${id}` } } : {}),
    ...(isDefault ? { default: true } : {}),
  });

  const cat = (groups: CatalogGroup[]): Catalog => ({ version: 2, updatedAt: '2026-05-07', groups });

  it('returns no conflict when only the default sibling is installed', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b')], { kind: 'pick-one' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a']))).toEqual([]);
  });

  it('returns a conflict when only a drifted sibling is installed', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b')], { kind: 'pick-one' }),
    ]);
    const out = findDefaultConflicts(c, new Set(['b']));
    expect(out).toHaveLength(1);
    expect(out[0]!.groupId).toBe('mem');
    expect(out[0]!.defaultItem.id).toBe('a');
    expect(out[0]!.driftedSiblings.map((s) => s.id)).toEqual(['b']);
  });

  it('returns a conflict when default and a drifted sibling are both installed', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b'), mkTool('c')], { kind: 'pick-one' }),
    ]);
    const out = findDefaultConflicts(c, new Set(['a', 'b']));
    expect(out).toHaveLength(1);
    expect(out[0]!.driftedSiblings.map((s) => s.id)).toEqual(['b']);
  });

  it('skips pick-one groups with no default flag', () => {
    const c = cat([
      group('mem', [mkTool('a'), mkTool('b')], { kind: 'pick-one' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a', 'b']))).toEqual([]);
  });

  it('skips pick-one groups with multiple default flags (ambiguous)', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b', true)], { kind: 'pick-one' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a', 'b']))).toEqual([]);
  });

  it('ignores non-pick-one groups even when multiple members are installed', () => {
    const c = cat([
      group('extras', [mkTool('a', true), mkTool('b')], { kind: 'pick-many' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a', 'b']))).toEqual([]);
  });
});
