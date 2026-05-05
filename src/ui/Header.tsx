import React from 'react';
import { Box, Text } from 'ink';
import figlet from 'figlet';
import { COLORS, GLYPHS, paint } from './theme.js';

export type HeaderVariant = 'splash' | 'compact';
export interface HeaderProps {
  variant: HeaderVariant;
}

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
        <Text color={COLORS.brand}>{figliedAutoClaude}</Text>
        <Text dimColor>{TAGLINE}</Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1}>
      <Text color={COLORS.brand}>{GLYPHS.brand} </Text>
      <Text>auto-claude</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// printHeader(): used by non-Ink stdout commands (`status`, `default --list`,
// etc.) so every entry point shows the same brand chrome.
//
//  - TTY + wide terminal  → colored figlet splash + tagline
//  - TTY + narrow (<40)   → single-line compact header
//  - non-TTY (piped/CI)   → plain ASCII line, no colors
export function printHeader(command?: string): string {
  const tag = command ? `auto-claude — ${command}` : 'auto-claude';
  if (!process.stdout.isTTY) return tag + '\n\n';

  const cols = process.stdout.columns ?? 80;
  if (cols < 40) {
    return paint(`${GLYPHS.brand} ${tag}`, 'brand') + '\n\n';
  }

  const fig = figliedAutoClaude
    .split('\n')
    .map((l) => paint(l, 'brand'))
    .join('\n');
  const tagline = command
    ? paint(`${TAGLINE} · ${command}`, 'dim')
    : paint(TAGLINE, 'dim');
  return `${fig}\n${tagline}\n\n`;
}
