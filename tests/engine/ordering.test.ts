import { describe, it, expect } from 'vitest';
import { orderForInstall } from '../../src/engine/ordering.js';
import type { CatalogItem } from '../../src/types.js';

const i = (id: string, kind: 'tool' | 'plugin', requiresRepo = false): CatalogItem => ({
  id, name: id, description: '', kind, defaultScope: 'global',
  detect: { command: 'x' },
  install: { command: 'install ' + id },
  postInstall: requiresRepo ? [{ type: 'shell', value: 'init', requiresRepo: true }] : undefined,
});

describe('orderForInstall', () => {
  it('sorts globals → repo-aware tools → plugins, preserving inner order', () => {
    const items = [
      i('plugA', 'plugin'),
      i('rtk', 'tool', true),
      i('claude-mem', 'tool'),
      i('plugB', 'plugin'),
    ];
    const out = orderForInstall(items);
    expect(out.map((x) => x.id)).toEqual(['claude-mem', 'rtk', 'plugA', 'plugB']);
  });

  it('returns empty when given empty', () => {
    expect(orderForInstall([])).toEqual([]);
  });
});
