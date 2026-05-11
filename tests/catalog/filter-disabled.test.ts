import { describe, it, expect } from 'vitest';
import { filterDisabled } from '../../src/catalog/filter-disabled.js';
import type { Catalog } from '../../src/types.js';

function mkItem(id: string, disabled = false) {
  return {
    id, name: id, description: '', kind: 'tool' as const,
    defaultScope: 'global' as const,
    detect: { command: 'true' },
    install: { command: 'true' },
    disabled: disabled || undefined,
  };
}

function mkCat(groups: Array<{ id: string; disabled?: boolean; items: ReturnType<typeof mkItem>[] }>): Catalog {
  return {
    version: 2,
    updatedAt: '2026-05-11',
    groups: groups.map((g) => ({
      id: g.id, name: g.id, kind: 'pick-many', items: g.items,
      ...(g.disabled ? { disabled: true } : {}),
    })),
  };
}

describe('filterDisabled', () => {
  it('drops disabled items', () => {
    const cat = mkCat([{ id: 'g1', items: [mkItem('a'), mkItem('b', true)] }]);
    const out = filterDisabled(cat);
    expect(out.groups[0].items.map((i) => i.id)).toEqual(['a']);
  });

  it('drops disabled groups', () => {
    const cat = mkCat([
      { id: 'g1', disabled: true, items: [mkItem('a')] },
      { id: 'g2', items: [mkItem('b')] },
    ]);
    const out = filterDisabled(cat);
    expect(out.groups.map((g) => g.id)).toEqual(['g2']);
  });

  it('drops groups left empty after item filter', () => {
    const cat = mkCat([
      { id: 'g1', items: [mkItem('a', true), mkItem('b', true)] },
      { id: 'g2', items: [mkItem('c')] },
    ]);
    const out = filterDisabled(cat);
    expect(out.groups.map((g) => g.id)).toEqual(['g2']);
  });

  it('keeps non-disabled items in a partially disabled group', () => {
    const cat = mkCat([{ id: 'g1', items: [mkItem('a'), mkItem('b', true), mkItem('c')] }]);
    const out = filterDisabled(cat);
    expect(out.groups[0].items.map((i) => i.id)).toEqual(['a', 'c']);
  });
});
