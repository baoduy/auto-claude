import React from 'react';
import { Box, Text } from 'ink';
import type { Catalog, CatalogGroup, CatalogItem, InstallState } from '../types.js';
import { isShellItem } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export interface ItemListProps {
  catalog: Catalog;
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
  showBack?: boolean;
  /** Total rows the list (items + group headers + indicators + footer) is
   *  allowed to occupy. Computed by the parent from the terminal height
   *  minus measured chrome. */
  viewportRows: number;
}

interface RowVisuals {
  glyph: string;
  glyphColor?: string;
  badge: string;
  badgeColor?: string;
  rowColor?: string;
  rowDim?: boolean;
  bracketed: boolean;
}

function visualsFor(it: CatalogItem, group: CatalogGroup, isSelected: boolean, installed: boolean, isCursor: boolean): RowVisuals {
  const bracketed = group.kind === 'pick-many';
  const onGlyph  = bracketed ? GLYPHS.ok       : GLYPHS.radioOn;
  const offGlyph = bracketed ? ' '             : GLYPHS.radioOff;

  const locked = installed && !(isShellItem(it) && it.uninstall);
  if (locked) {
    return {
      glyph: GLYPHS.locked, badge: ` ${GLYPHS.ok} installed (locked — no uninstaller)`,
      rowDim: !isCursor, rowColor: isCursor ? COLORS.cursor : undefined, bracketed,
    };
  }
  if (installed && isSelected) {
    return {
      glyph: onGlyph, glyphColor: COLORS.ok,
      badge: ` ${GLYPHS.ok} installed`, badgeColor: COLORS.ok,
      rowColor: isCursor ? COLORS.cursor : undefined, bracketed,
    };
  }
  if (installed && !isSelected) {
    return {
      glyph: bracketed ? GLYPHS.remove : offGlyph, glyphColor: COLORS.warn,
      badge: ` ${GLYPHS.remove} will uninstall`, badgeColor: COLORS.warn,
      rowColor: isCursor ? COLORS.cursor : COLORS.warn, bracketed,
    };
  }
  if (isSelected) {
    return {
      glyph: bracketed ? GLYPHS.add : onGlyph, glyphColor: COLORS.ok,
      badge: ` ${GLYPHS.add} will install`, badgeColor: COLORS.ok,
      rowColor: isCursor ? COLORS.cursor : undefined, bracketed,
    };
  }
  return { glyph: offGlyph, badge: '', rowColor: isCursor ? COLORS.cursor : undefined, bracketed };
}

/** Rows the footer hint occupies (marginTop=1 + 2 lines = 3). */
const FOOTER_ROWS = 3;
/** Minimum visible items so the viewport stays usable on tiny terminals. */
const MIN_VISIBLE = 3;

export function ItemList({ catalog, states, selected, cursor, showBack = false, viewportRows }: ItemListProps): React.JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));

  // Flatten items with global indices so we can window them while preserving
  // group structure for rendering.
  const flat: { item: CatalogItem; group: CatalogGroup; idx: number }[] = [];
  let i = 0;
  for (const g of catalog.groups) {
    for (const it of g.items) {
      flat.push({ item: it, group: g, idx: i });
      i++;
    }
  }
  const totalItems = flat.length;
  const groupCount = catalog.groups.length;

  // Allocate rows: footer is fixed; indicators take 1 row each when shown;
  // each visible group header takes 1 row. Worst case (every group visible
  // + both indicators) gives the smallest item budget — start there and
  // grow if windowing means fewer groups are actually visible.
  const indicatorBudget = 2; // assume both ↑/↓ indicators in worst case
  const groupHeaderBudget = groupCount; // 1 per group, worst case
  const itemBudget = Math.max(
    MIN_VISIBLE,
    viewportRows - FOOTER_ROWS - indicatorBudget - groupHeaderBudget,
  );
  const visibleCount = Math.min(totalItems, itemBudget);
  const half = Math.floor(visibleCount / 2);
  const maxStart = Math.max(0, totalItems - visibleCount);
  const viewStart = Math.max(0, Math.min(cursor - half, maxStart));
  const viewEnd = Math.min(totalItems, viewStart + visibleCount);

  const aboveCount = viewStart;
  const belowCount = Math.max(0, totalItems - viewEnd);

  // Re-bucket the windowed items back into their groups so headers only render
  // for groups with at least one visible item.
  const groupsInView: { group: CatalogGroup; items: { item: CatalogItem; idx: number }[] }[] = [];
  for (const g of catalog.groups) {
    const visible = flat
      .filter((f) => f.group === g && f.idx >= viewStart && f.idx < viewEnd)
      .map((f) => ({ item: f.item, idx: f.idx }));
    if (visible.length > 0) groupsInView.push({ group: g, items: visible });
  }

  const renderItem = (it: CatalogItem, group: CatalogGroup, idx: number) => {
    const isCursor = idx === cursor;
    const isSelected = selected.has(it.id);
    const installed = !!byId.get(it.id)?.installed;
    const v = visualsFor(it, group, isSelected, installed, isCursor);
    const cursorGlyph = isCursor ? `${GLYPHS.cursor} ` : '  ';
    const kindGlyph = it.kind === 'tool' ? GLYPHS.tool : it.kind === 'mcp' ? GLYPHS.mcp : GLYPHS.plugin;
    const kindColor = it.kind === 'tool' ? COLORS.tool : it.kind === 'mcp' ? COLORS.mcp : COLORS.plugin;
    const open  = v.bracketed ? '[' : '(';
    const close = v.bracketed ? ']' : ')';

    return (
      <Text key={it.id} color={v.rowColor} dimColor={v.rowDim}>
        <Text color={isCursor ? COLORS.cursor : undefined} bold={isCursor}>{cursorGlyph}</Text>
        <Text>  {open}</Text>
        <Text color={v.glyphColor} bold={!!v.glyphColor}>{v.glyph}</Text>
        <Text>{close} </Text>
        <Text color={kindColor}>{kindGlyph}</Text>
        <Text> {it.name.padEnd(20)} </Text>
        <Text>{it.description}</Text>
        <Text color={v.badgeColor}>{v.badge}</Text>
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" overflow="hidden">
        {aboveCount > 0 && (
          <Text dimColor>↑ {aboveCount} more above</Text>
        )}
        {groupsInView.map(({ group: g, items }) => (
          <Box key={g.id} flexDirection="column">
            <Text bold color={COLORS.group}>
              {g.name}
              {g.kind === 'pick-one' ? <Text dimColor> (pick one)</Text> : null}
            </Text>
            {items.map(({ item, idx }) => renderItem(item, g, idx))}
          </Box>
        ))}
        {belowCount > 0 && (
          <Text dimColor>↓ {belowCount} more below</Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {GLYPHS.cursor} navigate ↑↓ · space toggle · ← back / → next · enter continue · q quit
        </Text>
        <Text dimColor>uncheck an installed item to uninstall · [{GLYPHS.locked}] = no uninstaller</Text>
      </Box>
    </Box>
  );
}
