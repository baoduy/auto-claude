import React from 'react';
import { Box, Text } from 'ink';

export interface PluginScopePromptProps {
  cursor: 0 | 1;
  hasRepo: boolean;
}

export function PluginScopePrompt({ cursor, hasRepo }: PluginScopePromptProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>How should plugins be installed?</Text>
      <Text color={cursor === 0 ? 'cyan' : undefined}>
        {cursor === 0 ? '◉' : '○'} Globally (~/.claude — applies to all projects)
      </Text>
      {hasRepo && (
        <Text color={cursor === 1 ? 'cyan' : undefined}>
          {cursor === 1 ? '◉' : '○'} This project only (.claude in repo root)
        </Text>
      )}
      <Box marginTop={1}><Text dimColor>↑↓ navigate · enter confirm</Text></Box>
    </Box>
  );
}
