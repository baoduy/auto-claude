import { describe, it, expect } from 'vitest';
import { flattenItems, groupByItemId } from '../../src/catalog/groups.js';
import type { Catalog } from '../../src/types.js';

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
