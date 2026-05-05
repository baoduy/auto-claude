import React from 'react';
import { Box, Text } from 'ink';
import type { CatalogItem, InstallState } from '../types.js';

export interface ItemListProps {
  items: CatalogItem[];
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
}

export function ItemList({ items, states, selected, cursor }: ItemListProps): JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const tools = items.filter((i) => i.kind === 'tool');
  const plugins = items.filter((i) => i.kind === 'plugin');
  let idx = -1;

  const renderItem = (it: CatalogItem) => {
    idx++;
    const isCursor = idx === cursor;
    const isSelected = selected.has(it.id);
    const installed = byId.get(it.id)?.installed;
    const checkbox = isSelected || installed ? '[✓]' : '[ ]';
    const badge = installed ? ' ✓ installed' : '';
    return (
      <Text key={it.id} color={isCursor ? 'cyan' : undefined}>
        {isCursor ? '> ' : '  '}{checkbox} {it.name.padEnd(20)} {it.description}{badge}
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      <Text bold>Tools</Text>
      {tools.map(renderItem)}
      <Box marginTop={1}><Text bold>Plugins</Text></Box>
      {plugins.map(renderItem)}
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · space toggle · enter continue · q quit</Text>
      </Box>
    </Box>
  );
}
