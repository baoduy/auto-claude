import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { CatalogGroup } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export interface ConflictPromptProps {
  group: CatalogGroup;
  installedIds: string[];
  onResolve: (keptId: string) => void;
}

export function ConflictPrompt({ group, installedIds, onResolve }: ConflictPromptProps): React.JSX.Element {
  const conflicting = group.items.filter((i) => installedIds.includes(i.id));
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(conflicting.length - 1, c + 1));
    else if (key.return) {
      const kept = conflicting[cursor];
      if (kept) onResolve(kept.id);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={COLORS.warn} bold>⚠ Conflict in "{group.name}"</Text>
      <Text dimColor>Multiple members are installed but only one is supported. Pick one to keep — the other(s) will be uninstalled.</Text>
      <Box marginTop={1} flexDirection="column">
        {conflicting.map((it, i) => {
          const isCursor = i === cursor;
          return (
            <Text key={it.id} color={isCursor ? COLORS.cursor : undefined}>
              {isCursor ? `${GLYPHS.cursor} ` : '  '}({i === cursor ? GLYPHS.radioOn : GLYPHS.radioOff}) {it.name} — {it.description}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}><Text dimColor>↑↓ navigate · enter keep this one</Text></Box>
    </Box>
  );
}
