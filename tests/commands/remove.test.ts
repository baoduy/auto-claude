import { describe, it, expect, vi } from 'vitest';
import { planUninstall } from '../../src/commands/remove.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'a', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' },
    uninstall: { command: 'rm a' } },
  { id: 'b', name: 'b', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no uninstall
];
const states: InstallState[] = [
  { itemId: 'a', installed: true }, { itemId: 'b', installed: true },
];

describe('planUninstall', () => {
  it('returns only items that are installed AND have an uninstall command', () => {
    const out = planUninstall(items, states);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });
});
