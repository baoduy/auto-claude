import { describe, it, expect } from 'vitest';
import { renderStatus } from '../../src/commands/status.js';
import type { Catalog, InstallState } from '../../src/types.js';

const catalog: Catalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    {
      id: 'memory',
      name: 'Memory backend',
      kind: 'pick-one',
      items: [
        {
          id: 'a',
          name: 'A',
          description: '',
          kind: 'tool',
          defaultScope: 'global',
          detect: { command: 't' },
          install: { command: 't' },
        },
        {
          id: 'b',
          name: 'B',
          description: '',
          kind: 'tool',
          defaultScope: 'global',
          detect: { command: 't' },
          install: { command: 't' },
        },
      ],
    },
    {
      id: 'docs',
      name: 'Documentation providers',
      kind: 'pick-many',
      items: [
        {
          id: 'c',
          name: 'C',
          description: '',
          kind: 'plugin',
          defaultScope: 'global',
          detect: { command: 't' },
          install: { command: 't' },
        },
      ],
    },
  ],
};

describe('renderStatus', () => {
  it('renders a group header per group', () => {
    const states: InstallState[] = [
      { itemId: 'a', installed: true },
      { itemId: 'b', installed: false },
      { itemId: 'c', installed: false },
    ];
    const out = renderStatus(catalog, states);
    expect(out).toMatch(/Memory backend \(pick-one\)/);
    expect(out).toMatch(/Documentation providers/);
    const docsLine = out.split('\n').find((l) => l.includes('Documentation providers'))!;
    expect(docsLine).not.toMatch(/pick-/);
  });

  it('lists each item under its group header', () => {
    const states: InstallState[] = [
      { itemId: 'a', installed: true },
      { itemId: 'b', installed: false },
      { itemId: 'c', installed: false },
    ];
    const out = renderStatus(catalog, states);
    const lines = out.split('\n');
    const memHeader = lines.findIndex((l) => l.includes('Memory backend'));
    const docsHeader = lines.findIndex((l) => l.includes('Documentation providers'));
    expect(memHeader).toBeGreaterThanOrEqual(0);
    expect(docsHeader).toBeGreaterThan(memHeader);
    const aIdx = lines.findIndex((l) => l.includes('A'));
    const cIdx = lines.findIndex((l) => l.includes('C'));
    expect(aIdx).toBeGreaterThan(memHeader);
    expect(aIdx).toBeLessThan(docsHeader);
    expect(cIdx).toBeGreaterThan(docsHeader);
  });
});
