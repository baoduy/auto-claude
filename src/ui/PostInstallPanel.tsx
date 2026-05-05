import React from 'react';
import { Box, Text } from 'ink';
import type { EngineEvent } from '../types.js';

export function PostInstallPanel({ events }: { events: EngineEvent[] }): JSX.Element {
  const prompts = events.filter((e): e is Extract<EngineEvent, { type: 'post-prompt' }> => e.type === 'post-prompt');
  const done = events.some((e) => e.type === 'done');
  return (
    <Box flexDirection="column">
      <Text bold color="green">{done ? '✓ Done!' : ''}</Text>
      {prompts.length > 0 && <Text>Next steps:</Text>}
      {prompts.map((p, i) => (
        <Box key={i} flexDirection="column" marginLeft={2} marginTop={1}>
          <Text>• <Text bold>{p.label}</Text></Text>
          <Text dimColor>    {p.value}</Text>
        </Box>
      ))}
    </Box>
  );
}
