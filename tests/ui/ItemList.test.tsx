import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ItemList } from '../../src/ui/ItemList.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'A-tool', description: 'desc A', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } },
  { id: 'b', name: 'B-plug', description: 'desc B', kind: 'plugin', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } },
];
const states: InstallState[] = [
  { itemId: 'a', installed: true },
  { itemId: 'b', installed: false },
];

describe('<ItemList>', () => {
  it('renders both groups and an installed badge', () => {
    const { lastFrame } = render(
      <ItemList items={items} states={states} selected={new Set(['a'])} cursor={0} />
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Tools');
    expect(out).toContain('Plugins');
    expect(out).toContain('A-tool');
    expect(out).toContain('B-plug');
    expect(out).toContain('installed');
  });
});
