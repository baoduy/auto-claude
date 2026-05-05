import { describe, it, expect } from 'vitest';
import { planUpdate } from '../../src/commands/update.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'a', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, update: { command: 'up a' } },
  { id: 'b', name: 'b', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no update
  { id: 'c', name: 'c', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, update: { command: 'up c' } },
];
const states: InstallState[] = [
  { itemId: 'a', installed: true },
  { itemId: 'b', installed: true },
  { itemId: 'c', installed: false },
];

describe('planUpdate', () => {
  it('includes installed items with update command', () => {
    expect(planUpdate(items, states).map((i) => i.id)).toEqual(['a']);
  });
  it('--only filter narrows further', () => {
    expect(planUpdate(items, states, 'a').map((i) => i.id)).toEqual(['a']);
    expect(planUpdate(items, states, 'c').map((i) => i.id)).toEqual([]);
  });
});
