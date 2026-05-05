import { describe, it, expect } from 'vitest';
import { renderDefaultList } from '../../src/commands/default.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, default: true },
  { id: 'cm',  name: 'cm',  description: '', kind: 'plugin', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, default: true },
  { id: 'nope', name: 'nope', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no default flag
];
const states: InstallState[] = [
  { itemId: 'rtk', installed: true, version: 'rtk 1.0' },
  { itemId: 'cm',  installed: false },
];

describe('renderDefaultList', () => {
  it('groups by kind and shows install state', () => {
    const out = renderDefaultList(items.filter((i) => i.default === true), states);
    expect(out).toMatch(/Default tools:/);
    expect(out).toMatch(/Default plugins:/);
    expect(out).toMatch(/rtk\s+installed/);
    expect(out).toMatch(/cm\s+not installed/);
    expect(out).not.toContain('nope');
  });

  it('omits a section when its kind has no defaults', () => {
    const onlyTools = items.filter((i) => i.default === true && i.kind === 'tool');
    const out = renderDefaultList(onlyTools, [{ itemId: 'rtk', installed: true }]);
    expect(out).toContain('Default tools:');
    expect(out).not.toContain('Default plugins:');
  });
});
