import React from 'react';
import { Box, Text } from 'ink';
import type { EngineEvent } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

interface Line { id: string; label: string; status: 'running' | 'ok' | 'fail'; index: number; total: number; isPost?: boolean }

function reduce(events: EngineEvent[]): Line[] {
  const lines: Line[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'item-start':
        lines.push({ id: e.itemId, label: e.label, status: 'running', index: e.index, total: e.total });
        break;
      case 'item-success': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && !l.isPost);
        if (last) last.status = 'ok';
        break;
      }
      case 'item-failure': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && !l.isPost);
        if (last) last.status = 'fail';
        break;
      }
      case 'post-shell-start':
        lines.push({ id: e.itemId, label: '↳ ' + e.label, status: 'running', index: 0, total: 0, isPost: true });
        break;
      case 'post-shell-success': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && l.isPost);
        if (last) last.status = 'ok';
        break;
      }
      case 'post-shell-failure': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && l.isPost);
        if (last) last.status = 'fail';
        break;
      }
      case 'post-shell-deferred':
        lines.push({ id: e.itemId, label: '↳ ' + e.label + ' (will run after wizard exits)', status: 'ok', index: 0, total: 0, isPost: true });
        break;
    }
  }
  return lines;
}

function symFor(status: Line['status']): { glyph: string; color?: string } {
  if (status === 'ok') return { glyph: GLYPHS.ok, color: COLORS.ok };
  if (status === 'fail') return { glyph: GLYPHS.fail, color: COLORS.fail };
  return { glyph: GLYPHS.running };
}

export function ProgressLog({ events }: { events: EngineEvent[] }): React.JSX.Element {
  const lines = reduce(events);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => {
        const { glyph, color } = symFor(l.status);
        if (l.isPost) {
          return (
            <Text key={i}>
              <Text>    </Text>
              <Text>{l.label} </Text>
              <Text color={color} dimColor={l.status === 'running'}>{glyph}</Text>
            </Text>
          );
        }
        return (
          <Text key={i}>
            <Text dimColor>{`[${l.index}/${l.total}] `}</Text>
            <Text color={l.status === 'fail' ? COLORS.fail : undefined}>{l.label} </Text>
            <Text color={color} dimColor={l.status === 'running'}>{glyph}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
