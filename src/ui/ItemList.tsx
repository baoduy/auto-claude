import React from 'react';
import { Box, Text } from 'ink';
import type { CatalogItem, InstallState } from '../types.js';

export interface ItemListProps {
  items: CatalogItem[];
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
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
    const installed = byId.get(it.id)?.installed;
    const locked = installed && !it.uninstall;
    let checkbox: string;
    let badge = '';
    if (locked) {
      checkbox = '[■]';
      badge = ' ✓ installed (locked — no uninstaller)';
    } else if (installed && isSelected) {
      checkbox = '[✓]';
      badge = ' ✓ installed';
    } else if (installed && !isSelected) {
      checkbox = '[ ]';
      badge = ' ⚠ will uninstall';
    } else if (isSelected) {
      checkbox = '[✓]';
    } else {
      checkbox = '[ ]';
    }
    const color = isCursor ? 'cyan' : installed && !isSelected ? 'yellow' : undefined;
    return (
      <Text key={it.id} color={color} dimColor={!!locked && !isCursor}>
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
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑↓ navigate · space toggle · enter continue · q quit</Text>
        <Text dimColor>uncheck an installed item to uninstall it · [■] = no uninstaller available</Text>
      </Box>
    </Box>
  );
}
