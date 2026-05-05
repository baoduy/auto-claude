import React from 'react';
import { Box, Text } from 'ink';
import type { EngineEvent } from '../types.js';

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
    }
  }
  return lines;
}

export function ProgressLog({ events }: { events: EngineEvent[] }): React.JSX.Element {
  const lines = reduce(events);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => {
        const sym = l.status === 'ok' ? '✓' : l.status === 'fail' ? '✗' : '·';
        const prefix = l.isPost ? '    ' : `[${l.index}/${l.total}] `;
        return <Text key={i} color={l.status === 'fail' ? 'red' : undefined}>{prefix}{l.label} {sym}</Text>;
      })}
    </Box>
  );
}
