import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ItemList } from '../../src/ui/ItemList.js';
import type { Catalog } from '../../src/types.js';

const catalog: Catalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    {
      id: 'memory', name: 'Memory backend', kind: 'pick-one',
      items: [
        { id: 'a', name: 'A', description: 'item-a', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
        { id: 'b', name: 'B', description: 'item-b', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
      ],
    },
    {
      id: 'docs', name: 'Documentation providers', kind: 'pick-many',
      items: [
        { id: 'c', name: 'C', description: 'item-c', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ],
    },
  ],
};

describe('ItemList grouped layout', () => {
  it('shows group headers', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set(['a'])} cursor={0} />
    );
    expect(lastFrame()).toMatch(/Memory backend/);
    expect(lastFrame()).toMatch(/Documentation providers/);
  });

  it('renders pick-one members with radio glyphs', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set(['a'])} cursor={0} />
    );
    expect(lastFrame()).toMatch(/[◉●]/);
    expect(lastFrame()).toMatch(/[○◯]/);
  });

  it('renders pick-many members with checkbox glyphs', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set()} cursor={0} />
    );
    expect(lastFrame()).toMatch(/\[ \]/);
  });
});
