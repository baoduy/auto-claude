// Single source of truth for icons and colors used across the TUI and the
// plain stdout commands. Ink components consume `COLORS.*` (named or hex
// strings that Ink understands). Non-Ink stdout commands use `paint()`,
// which emits ANSI escapes when stdout is a TTY and degrades to plain text
// when piped.

export const COLORS = {
  brand: '#D97706', // orange
  tool: 'cyan',
  plugin: 'magenta',
  ok: 'green',
  fail: 'red',
  warn: 'yellow',
  info: 'blue',
  cursor: 'cyan',
} as const;

export const GLYPHS = {
  // kinds
  tool: '⚙',
  plugin: '◆',
  // status / actions
  ok: '✓',
  fail: '✗',
  add: '+',
  remove: '−',
  locked: '■',
  info: 'ⓘ',
  missing: '○',
  // wizard chrome
  cursor: '▶',
  selected: '◉',
  unselected: '○',
  // misc
  brand: '✱',
  running: '·',
  arrow: '→',
  recycle: '↺',
} as const;

// ---------------------------------------------------------------------------
// ANSI helper for non-Ink (plain stdout) commands.

export type PaintColor =
  | 'brand'
  | 'tool'
  | 'plugin'
  | 'ok'
  | 'fail'
  | 'warn'
  | 'info'
  | 'cursor'
  | 'dim'
  | 'bold';

const ANSI: Record<PaintColor, string> = {
  brand: '\x1b[38;2;217;119;6m', // truecolor #D97706
  tool: '\x1b[36m',
  plugin: '\x1b[35m',
  ok: '\x1b[32m',
  fail: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[34m',
  cursor: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};
const RESET = '\x1b[0m';

export function paint(text: string, color: PaintColor): string {
  if (!process.stdout.isTTY) return text;
  return `${ANSI[color]}${text}${RESET}`;
}
