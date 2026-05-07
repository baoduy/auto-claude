import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, GLYPHS } from './theme.js';

export interface ConfirmAction {
  verb: 'Install' | 'Uninstall';
  name: string;
  /** Optional trailing annotation (e.g. "(replaced by mempalace)"). */
  suffix?: string;
}

export interface ConfirmKindGroup {
  /** "Tools" | "Plugins" | "MCP servers". */
  label: string;
  /** Trailing annotation on the heading (e.g. " (project)"). Omitted for
   *  tools because scope doesn't apply to them. */
  scopeSuffix?: string;
  /** Item kind, used for the kind glyph/colour. `null` for tools (no glyph). */
  kind: 'tool' | 'plugin' | 'mcp';
  actions: ConfirmAction[];
}

export interface ConfirmSummaryProps {
  groups: ConfirmKindGroup[];
}

export function ConfirmSummary({ groups }: ConfirmSummaryProps): React.JSX.Element {
  const visible = groups.filter((g) => g.actions.length > 0);
  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.brand}>The following actions will run:</Text>
      {visible.map((g) => (
        <Box key={g.label} flexDirection="column" marginTop={1}>
          <Text>
            {'  '}
            <Text bold color={COLORS.group}>{g.label}</Text>
            {g.scopeSuffix ? <Text dimColor>{g.scopeSuffix}</Text> : null}
          </Text>
          {g.actions.map((a, i) => {
            const isUninstall = a.verb === 'Uninstall';
            const glyph = isUninstall ? GLYPHS.remove : GLYPHS.add;
            const color = isUninstall ? COLORS.warn : COLORS.ok;
            return (
              <Text key={`${a.verb}-${a.name}-${i}`}>
                {'    '}
                <Text color={color} bold>{glyph}</Text>{' '}
                <Text>{a.verb} {a.name}</Text>
                {a.suffix ? <Text dimColor>{' '}{a.suffix}</Text> : null}
              </Text>
            );
          })}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>enter to install · q to abort</Text>
      </Box>
    </Box>
  );
}
