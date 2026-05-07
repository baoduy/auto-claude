import React from 'react';
import { Box, Text } from 'ink';
import type { ItemKind } from '../types.js';
import { COLORS } from './theme.js';

const LABELS: Record<ItemKind, string> = {
  tool: 'Tools',
  plugin: 'Plugins',
  mcp: 'MCP',
};

export interface KindPageBreadcrumbProps {
  kinds: ItemKind[];
  index: number;
}

export function KindPageBreadcrumb({ kinds, index }: KindPageBreadcrumbProps): React.JSX.Element {
  const total = kinds.length;
  return (
    <Box flexDirection="row">
      {kinds.map((k, i) => {
        const isCurrent = i === index;
        const label = LABELS[k];
        const suffix = isCurrent ? ` (${i + 1}/${total})` : '';
        const sep = i < kinds.length - 1 ? '  ·  ' : '';
        return (
          <Text key={k}>
            <Text bold={isCurrent} color={isCurrent ? COLORS.cursor : undefined} dimColor={!isCurrent}>
              {label}{suffix}
            </Text>
            <Text dimColor>{sep}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
