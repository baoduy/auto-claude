import React from 'react';
import { Box, Text } from 'ink';
import type { CatalogItem, InstallState } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export interface ItemListProps {
  items: CatalogItem[];
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
}

interface RowVisuals {
  checkboxGlyph: string;       // inside the [ ]
  checkboxColor?: string;
  badge: string;               // trailing status text
  badgeColor?: string;
  rowColor?: string;
  rowDim?: boolean;
}

function visualsFor(it: CatalogItem, isSelected: boolean, installed: boolean, isCursor: boolean): RowVisuals {
  const locked = installed && !it.uninstall;
  if (locked) {
    return {
      checkboxGlyph: GLYPHS.locked,
      badge: ` ${GLYPHS.ok} installed (locked — no uninstaller)`,
      rowDim: !isCursor,
      rowColor: isCursor ? COLORS.cursor : undefined,
    };
  }
  if (installed && isSelected) {
    return {
      checkboxGlyph: GLYPHS.ok,
      checkboxColor: COLORS.ok,
      badge: ` ${GLYPHS.ok} installed`,
      badgeColor: COLORS.ok,
      rowColor: isCursor ? COLORS.cursor : undefined,
    };
  }
  if (installed && !isSelected) {
    return {
      checkboxGlyph: GLYPHS.remove,
      checkboxColor: COLORS.warn,
      badge: ` ${GLYPHS.remove} will uninstall`,
      badgeColor: COLORS.warn,
      rowColor: isCursor ? COLORS.cursor : COLORS.warn,
    };
  }
  if (isSelected) {
    return {
      checkboxGlyph: GLYPHS.add,
      checkboxColor: COLORS.ok,
      badge: ` ${GLYPHS.add} will install`,
      badgeColor: COLORS.ok,
      rowColor: isCursor ? COLORS.cursor : undefined,
    };
  }
  return {
    checkboxGlyph: ' ',
    badge: '',
    rowColor: isCursor ? COLORS.cursor : undefined,
  };
}

export function ItemList({ items, states, selected, cursor }: ItemListProps): React.JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const tools = items.filter((i) => i.kind === 'tool');
  const plugins = items.filter((i) => i.kind === 'plugin');
  let idx = -1;

  const renderItem = (it: CatalogItem) => {
    idx++;
    const isCursor = idx === cursor;
    const isSelected = selected.has(it.id);
    const installed = !!byId.get(it.id)?.installed;
    const v = visualsFor(it, isSelected, installed, isCursor);
    const cursorGlyph = isCursor ? `${GLYPHS.cursor} ` : '  ';
    const kindGlyph = it.kind === 'tool' ? GLYPHS.tool : GLYPHS.plugin;
    const kindColor = it.kind === 'tool' ? COLORS.tool : COLORS.plugin;

    return (
      <Text key={it.id} color={v.rowColor} dimColor={v.rowDim}>
        <Text color={isCursor ? COLORS.cursor : undefined} bold={isCursor}>{cursorGlyph}</Text>
        <Text>[</Text>
        <Text color={v.checkboxColor} bold={!!v.checkboxColor}>{v.checkboxGlyph}</Text>
        <Text>] </Text>
        <Text color={kindColor}>{kindGlyph}</Text>
        <Text> {it.name.padEnd(20)} </Text>
        <Text>{it.description}</Text>
        <Text color={v.badgeColor}>{v.badge}</Text>
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.brand}>Tools</Text>
      {tools.map(renderItem)}
      <Box marginTop={1}><Text bold color={COLORS.brand}>Plugins</Text></Box>
      {plugins.map(renderItem)}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{GLYPHS.cursor} navigate ↑↓ · space toggle · enter continue · q quit</Text>
        <Text dimColor>uncheck an installed item to uninstall · [{GLYPHS.locked}] = no uninstaller</Text>
      </Box>
    </Box>
  );
}
