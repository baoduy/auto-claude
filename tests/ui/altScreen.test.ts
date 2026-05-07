import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enterAltScreen, exitAltScreen, _resetAltScreenForTests } from '../../src/ui/altScreen.js';

function makeStream(isTTY: boolean): NodeJS.WriteStream {
  const write = vi.fn();
  return { isTTY, write } as unknown as NodeJS.WriteStream;
}

describe('altScreen', () => {
  beforeEach(() => { _resetAltScreenForTests(); });

  it('enters the alternate screen buffer and homes the cursor on a TTY', () => {
    const stream = makeStream(true);
    enterAltScreen(stream);
    expect(stream.write).toHaveBeenCalledWith('\x1b[2J\x1b[3J\x1b[H\x1b[?1049h\x1b[2J\x1b[H');
  });

  it('exits the alternate screen buffer when previously entered', () => {
    const stream = makeStream(true);
    enterAltScreen(stream);
    (stream.write as ReturnType<typeof vi.fn>).mockClear();
    exitAltScreen(stream);
    expect(stream.write).toHaveBeenCalledWith('\x1b[?1049l');
  });

  it('does nothing on a non-TTY stream', () => {
    const stream = makeStream(false);
    enterAltScreen(stream);
    exitAltScreen(stream);
    expect(stream.write).not.toHaveBeenCalled();
  });

  it('is idempotent: a second enter without exit does not double-write', () => {
    const stream = makeStream(true);
    enterAltScreen(stream);
    enterAltScreen(stream);
    expect(stream.write).toHaveBeenCalledTimes(1);
  });

  it('exit is a no-op when not currently entered', () => {
    const stream = makeStream(true);
    exitAltScreen(stream);
    expect(stream.write).not.toHaveBeenCalled();
  });
});
