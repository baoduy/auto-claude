import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, GLYPHS } from './theme.js';

export interface ScopeKindGroup {
  /** Item kind covered by this section. Drives the kind glyph + colour. */
  kind: 'plugin' | 'mcp';
  /** Heading shown above the rows (e.g. "Plugins", "MCP servers"). */
  label: string;
  /** Item names to install (rendered with `+`, green). */
  installs: string[];
  /** Item names to uninstall (rendered with `−`, yellow). */
  uninstalls: string[];
}

export interface ScopePromptProps {
  cursor: 0 | 1;
  hasRepo: boolean;
  /** Items affected by the scope choice, grouped by kind. Tools are excluded
   *  (their scope is moot). Empty `installs` + `uninstalls` arrays cause the
   *  group to be skipped; an empty `groups` array suppresses the whole
   *  "Selected" block. */
  groups: ScopeKindGroup[];
}

export function ScopePrompt({ cursor, hasRepo, groups }: ScopePromptProps): React.JSX.Element {
  const visible = groups.filter((g) => g.installs.length > 0 || g.uninstalls.length > 0);
  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.brand}>How should plugins &amp; MCP servers be installed?</Text>

      {visible.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Selected:</Text>
          {visible.map((g) => (
            <KindSection key={g.kind} group={g} />
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text color={cursor === 0 ? COLORS.cursor : undefined} bold={cursor === 0}>
          {cursor === 0 ? GLYPHS.radioOn : GLYPHS.radioOff} Globally (~/.claude — applies to all projects)
        </Text>
        {hasRepo && (
          <Text color={cursor === 1 ? COLORS.cursor : undefined} bold={cursor === 1}>
            {cursor === 1 ? GLYPHS.radioOn : GLYPHS.radioOff} This project only (.claude + .mcp.json in repo root)
          </Text>
        )}
      </Box>
      <Box marginTop={1}><Text dimColor>↑↓ navigate · enter confirm</Text></Box>
    </Box>
  );
}

function KindSection({ group }: { group: ScopeKindGroup }): React.JSX.Element {
  const kindGlyph = group.kind === 'mcp' ? GLYPHS.mcp : GLYPHS.plugin;
  const kindColor = group.kind === 'mcp' ? COLORS.mcp : COLORS.plugin;
  return (
    <Box flexDirection="column">
      <Text>  <Text bold color={COLORS.group}>{group.label}</Text></Text>
      {group.installs.map((name) => (
        <Text key={`i-${name}`}>
          {'    '}
          <Text color={COLORS.ok} bold>{GLYPHS.add}</Text>{' '}
          <Text color={kindColor}>{kindGlyph}</Text>{' '}
          <Text>{name}</Text>
        </Text>
      ))}
      {group.uninstalls.map((name) => (
        <Text key={`u-${name}`}>
          {'    '}
          <Text color={COLORS.warn} bold>{GLYPHS.remove}</Text>{' '}
          <Text color={kindColor}>{kindGlyph}</Text>{' '}
          <Text>{name}</Text>
          <Text color={COLORS.warn} dimColor>{' '}(will uninstall)</Text>
        </Text>
      ))}
    </Box>
  );
}
