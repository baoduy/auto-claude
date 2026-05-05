import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, GLYPHS } from './theme.js';

export interface PluginScopePromptProps {
  cursor: 0 | 1;
  hasRepo: boolean;
}

export function PluginScopePrompt({ cursor, hasRepo }: PluginScopePromptProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.brand}>How should plugins be installed?</Text>
      <Text color={cursor === 0 ? COLORS.cursor : undefined} bold={cursor === 0}>
        {cursor === 0 ? GLYPHS.selected : GLYPHS.unselected} Globally (~/.claude — applies to all projects)
      </Text>
      {hasRepo && (
        <Text color={cursor === 1 ? COLORS.cursor : undefined} bold={cursor === 1}>
          {cursor === 1 ? GLYPHS.selected : GLYPHS.unselected} This project only (.claude in repo root)
        </Text>
      )}
      <Box marginTop={1}><Text dimColor>↑↓ navigate · enter confirm</Text></Box>
    </Box>
  );
}
