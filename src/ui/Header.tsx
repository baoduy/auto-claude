import React from 'react';
import { Box, Text } from 'ink';
import figlet from 'figlet';

export type HeaderVariant = 'splash' | 'compact';
export interface HeaderProps {
  variant: HeaderVariant;
}

const ORANGE = '#D97706';
const TAGLINE = 'curated tools & plugins for Claude Code';

let figliedAutoClaude = '';
try {
  figliedAutoClaude = figlet.textSync('Auto Claude', { font: 'Standard' });
} catch {
  figliedAutoClaude = 'Auto Claude';
}

export function Header({ variant }: HeaderProps): React.JSX.Element | null {
  if (!process.stdout.isTTY) return null;

  const narrow = (process.stdout.columns ?? 80) < 40;
  const effective: HeaderVariant = narrow ? 'compact' : variant;

  if (effective === 'splash') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={ORANGE}>{figliedAutoClaude}</Text>
        <Text dimColor>{TAGLINE}</Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1}>
      <Text color={ORANGE}>✱ </Text>
      <Text>auto-claude</Text>
    </Box>
  );
}
