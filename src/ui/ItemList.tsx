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
  /** Override the terminal row count (for tests). Defaults to process.stdout.rows. */
  terminalRows?: number;
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

/** Approximate non-item rows reserved by chrome (header/breadcrumb/group margins/footer). */
const RESERVED_ROWS = 14;
/** Minimum visible items so the viewport is always usable, even on tiny terminals. */
const MIN_VISIBLE = 5;

export function ItemList({ catalog, states, selected, cursor, showBack = false, terminalRows }: ItemListProps): React.JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));

  // Build a flat index of items so we can window them globally while preserving group structure.
  const flat: { item: CatalogItem; group: CatalogGroup; idx: number }[] = [];
  let i = 0;
  for (const g of catalog.groups) {
    for (const it of g.items) {
      flat.push({ item: it, group: g, idx: i });
      i++;
    }
  }
  const totalItems = flat.length;

  // Compute viewport — keep cursor centered when possible, clamp to bounds.
  const rows = terminalRows ?? process.stdout.rows ?? 24;
  const visibleCount = Math.max(MIN_VISIBLE, Math.min(totalItems, rows - RESERVED_ROWS));
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
      {aboveCount > 0 && (
        <Text dimColor>↑ {aboveCount} more above</Text>
      )}
      {groupsInView.map(({ group: g, items }) => (
        <Box key={g.id} flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.group}>
            {g.name}
            {g.kind === 'pick-one' ? <Text dimColor> (pick one)</Text> : null}
          </Text>
          {g.description ? <Text dimColor>{g.description}</Text> : null}
          {items.map(({ item, idx }) => renderItem(item, g, idx))}
        </Box>
      ))}
      {belowCount > 0 && (
        <Text dimColor>↓ {belowCount} more below</Text>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {GLYPHS.cursor} navigate ↑↓ · space toggle · enter continue{showBack ? ' · ← back' : ''} · q quit
        </Text>
        <Text dimColor>uncheck an installed item to uninstall · [{GLYPHS.locked}] = no uninstaller</Text>
      </Box>
    </Box>
  );
}
