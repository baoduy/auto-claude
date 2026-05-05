import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, GLYPHS } from './theme.js';

export function ConfirmSummary({ lines }: { lines: string[] }): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.brand}>The following actions will run:</Text>
      {lines.map((l, i) => {
        const isUninstall = l.startsWith('Uninstall ');
        const glyph = isUninstall ? GLYPHS.remove : GLYPHS.add;
        const color = isUninstall ? COLORS.warn : COLORS.ok;
        return (
          <Text key={i}>
            {'  '}
            <Text color={color} bold>{glyph}</Text>{' '}
            <Text>{l}</Text>
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>enter to install · q to abort</Text>
      </Box>
    </Box>
  );
}
