/**
 * Alternate screen buffer helpers.
 *
 * Switching to the alternate screen buffer (the same trick `vim`, `less`, and
 * `htop` use) gives the wizard a fixed-size canvas: redraws don't pollute the
 * scrollback, and on exit the user's previous terminal contents reappear
 * untouched. This prevents the "cursor scrolled off-screen" issue that happens
 * when Ink renders a tall frame into the normal screen buffer.
 *
 * No-op on non-TTY streams so piped / CI usage stays clean.
 *
 * Sequences:
 *   \x1b[?1049h  — enter alt screen + save cursor
 *   \x1b[?1049l  — exit alt screen + restore cursor
 *   \x1b[2J      — clear entire screen
 *   \x1b[3J      — clear scrollback
 *   \x1b[H       — move cursor home (top-left)
 */

let entered = false;
let cleanupRegistered = false;

export function enterAltScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY || entered) return;
  // Clear the visible buffer first (in case alt-screen is unsupported and we
  // fall back to the normal buffer), then enter the alt screen and clear it
  // too so the wizard always renders onto a blank canvas.
  stream.write('\x1b[2J\x1b[3J\x1b[H\x1b[?1049h\x1b[2J\x1b[H');
  entered = true;
  registerCleanupOnce(stream);
}

export function exitAltScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (!stream.isTTY || !entered) return;
  stream.write('\x1b[?1049l');
  entered = false;
}

/** Test-only: reset internal state. */
export function _resetAltScreenForTests(): void {
  entered = false;
  cleanupRegistered = false;
}

function registerCleanupOnce(stream: NodeJS.WriteStream): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const restore = () => exitAltScreen(stream);
  // Guarantee the terminal is restored even if Ink doesn't get a clean unmount
  // (Ctrl-C, kill, or an unhandled crash).
  process.once('exit', restore);
  process.once('SIGINT', () => { restore(); process.exit(130); });
  process.once('SIGTERM', () => { restore(); process.exit(143); });
}
