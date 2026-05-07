import { describe, it, expect } from 'vitest';
import { orderForInstall, orderForUninstall } from '../../src/engine/ordering.js';
import type { CatalogItem } from '../../src/types.js';

const i = (id: string, kind: 'tool' | 'plugin', requiresRepo = false): CatalogItem => ({
  id, name: id, description: '', kind, defaultScope: 'global',
  detect: { command: 'x' },
  install: { command: 'install ' + id },
  postInstall: requiresRepo ? [{ type: 'shell', value: 'init', requiresRepo: true }] : undefined,
});

const item = (id: string, kind: 'tool' | 'plugin'): CatalogItem => ({
  id, name: id, description: '', kind, defaultScope: 'global',
  detect: { command: 't' }, install: { command: 't' }, uninstall: { command: 't' },
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

describe('install/uninstall ordering during a swap', () => {
  it('uninstall list reverses install order so removed items go first', () => {
    const a = item('a', 'tool');
    const b = item('b', 'tool');
    const installOrder = orderForInstall([b]).map((i) => i.id);
    const uninstallOrder = orderForUninstall([a]).map((i) => i.id);
    expect([...uninstallOrder, ...installOrder]).toEqual(['a', 'b']);
  });
});
