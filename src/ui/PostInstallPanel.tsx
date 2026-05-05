import React from 'react';
import { Box, Text } from 'ink';
import type { EngineEvent } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export function PostInstallPanel({ events }: { events: EngineEvent[] }): React.JSX.Element {
  const prompts = events.filter((e): e is Extract<EngineEvent, { type: 'post-prompt' }> => e.type === 'post-prompt');
  const done = events.some((e) => e.type === 'done');
  return (
    <Box flexDirection="column">
      {done && (
        <Text bold color={COLORS.ok}>{GLYPHS.ok} Done!</Text>
      )}
      {prompts.length > 0 && (
        <Box marginTop={done ? 1 : 0}>
          <Text bold color={COLORS.brand}>Next steps:</Text>
        </Box>
      )}
      {prompts.map((p, i) => (
        <Box key={i} flexDirection="column" marginLeft={2} marginTop={1}>
          <Text>
            <Text color={COLORS.info} bold>{GLYPHS.info}</Text>{' '}
            <Text bold>{p.label}</Text>
          </Text>
          <Text dimColor>    {p.value}</Text>
        </Box>
      ))}
    </Box>
  );
}
