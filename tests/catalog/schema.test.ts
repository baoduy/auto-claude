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
    { id: 'g2', name: 'G2', kind: 'pick-one', items: [baseItem('c', { default: true }), baseItem('d')] },
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

  it('rejects multiple default:true in a pick-one group', () => {
    const bad = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'g1', name: 'G1', kind: 'pick-one', items: [
          baseItem('a', { default: true }),
          baseItem('b', { default: true }),
        ] },
      ],
    };
    expect(() => CatalogSchema.parse(bad)).toThrow(/at most one default/i);
  });

  it('allows multiple default:true in a pick-many group', () => {
    const ok = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'g1', name: 'G1', kind: 'pick-many', items: [
          baseItem('a', { default: true }),
          baseItem('b', { default: true }),
        ] },
      ],
    };
    expect(() => CatalogSchema.parse(ok)).not.toThrow();
  });
});
