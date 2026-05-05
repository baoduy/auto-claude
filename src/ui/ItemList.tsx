import React from 'react';
import { Box, Text } from 'ink';
import type { Catalog, CatalogGroup, CatalogItem, InstallState } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export interface ItemListProps {
  catalog: Catalog;
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
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

  const locked = installed && !it.uninstall;
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

export function ItemList({ catalog, states, selected, cursor }: ItemListProps): React.JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  let idx = -1;

  const renderItem = (it: CatalogItem, group: CatalogGroup) => {
    idx++;
    const isCursor = idx === cursor;
    const isSelected = selected.has(it.id);
    const installed = !!byId.get(it.id)?.installed;
    const v = visualsFor(it, group, isSelected, installed, isCursor);
    const cursorGlyph = isCursor ? `${GLYPHS.cursor} ` : '  ';
    const kindGlyph = it.kind === 'tool' ? GLYPHS.tool : GLYPHS.plugin;
    const kindColor = it.kind === 'tool' ? COLORS.tool : COLORS.plugin;
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
      {catalog.groups.map((g) => (
        <Box key={g.id} flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.group}>
            {g.name}
            {g.kind === 'pick-one' ? <Text dimColor> (pick one)</Text> : null}
          </Text>
          {g.description ? <Text dimColor>{g.description}</Text> : null}
          {g.items.map((it) => renderItem(it, g))}
        </Box>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{GLYPHS.cursor} navigate ↑↓ · space toggle · enter continue · q quit</Text>
        <Text dimColor>uncheck an installed item to uninstall · [{GLYPHS.locked}] = no uninstaller</Text>
      </Box>
    </Box>
  );
}
