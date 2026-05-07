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

describe('mcp item visuals', () => {
  it('renders an mcp item with the green ⚡ glyph', () => {
    const mcpCatalog: Catalog = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [{
        id: 'mcp-servers', name: 'MCP servers', kind: 'pick-many' as const,
        items: [{
          id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
          mcpKey: 'foo', mcpServer: { command: 'x' },
        }],
      }],
    };
    const { lastFrame } = render(
      <ItemList catalog={mcpCatalog} states={[]} selected={new Set()} cursor={0} viewportRows={100} />
    );
    expect(lastFrame()).toContain('⚡');
  });
});

describe('ItemList grouped layout', () => {
  it('shows group headers', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set(['a'])} cursor={0} viewportRows={100} />
    );
    expect(lastFrame()).toMatch(/Memory backend/);
    expect(lastFrame()).toMatch(/Documentation providers/);
  });

  it('renders pick-one members with radio glyphs', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set(['a'])} cursor={0} viewportRows={100} />
    );
    expect(lastFrame()).toMatch(/[◉●]/);
    expect(lastFrame()).toMatch(/[○◯]/);
  });

  it('renders pick-many members with checkbox glyphs', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set()} cursor={0} viewportRows={100} />
    );
    expect(lastFrame()).toMatch(/\[ \]/);
  });
});

describe('ItemList viewport (cursor follows window)', () => {
  // 20 items in one group — far more than fits in any reasonable viewport.
  const longCatalog: Catalog = {
    version: 2, updatedAt: '2026-05-07',
    groups: [{
      id: 'big', name: 'Big group', kind: 'pick-many',
      items: Array.from({ length: 20 }, (_, n) => ({
        id: `i${n}`, name: `Item${n}`, description: `desc-${n}`,
        kind: 'plugin' as const, defaultScope: 'global' as const,
        detect: { command: 'true' }, install: { command: 'true' },
      })),
    }],
  };

  // viewportRows = 12 → after FOOTER (3) + indicators (2) + group header (1)
  // → item budget = 6.
  it('clips above and below when the cursor is in the middle', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={10} viewportRows={12} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/more above/);
    expect(frame).toMatch(/more below/);
    expect(frame).toContain('Item10');
    expect(frame).not.toContain('Item0 ');
    expect(frame).not.toContain('Item19');
  });

  it('does not show "more above" at the top of the list', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={0} viewportRows={12} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/more above/);
    expect(frame).toMatch(/more below/);
    expect(frame).toContain('Item0');
  });

  it('does not show "more below" at the bottom of the list', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={19} viewportRows={12} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/more above/);
    expect(frame).not.toMatch(/more below/);
    expect(frame).toContain('Item19');
  });

  it('shows all items when the viewport is large enough', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={0} viewportRows={100} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/more above/);
    expect(frame).not.toMatch(/more below/);
    expect(frame).toContain('Item0');
    expect(frame).toContain('Item19');
  });

  it('clamps to MIN_VISIBLE when viewportRows is unreasonably small', () => {
    // viewportRows = 4 leaves negative budget after fixed chrome — clamp to MIN_VISIBLE=3.
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={5} viewportRows={4} />
    );
    const frame = lastFrame() ?? '';
    // Cursor item must be present; some items must be hidden.
    expect(frame).toContain('Item5');
    expect(frame).toMatch(/more above/);
    expect(frame).toMatch(/more below/);
  });
});
