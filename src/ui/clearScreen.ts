/**
 * Clear the terminal viewport, scrollback, and reset the cursor to home.
 *
 * No-ops when the stream is not a TTY so piped/redirected output stays clean
 * (e.g. `auto-claude | tee log.txt` or CI logs).
 */
export function clearScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY) return;
  stream.write('\x1b[2J\x1b[3J\x1b[H');
}
