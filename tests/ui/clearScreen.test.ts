import { describe, it, expect, vi } from 'vitest';
import { clearScreen } from '../../src/ui/clearScreen.js';

function makeStream(isTTY: boolean): NodeJS.WriteStream {
  const write = vi.fn();
  return { isTTY, write } as unknown as NodeJS.WriteStream;
}

describe('clearScreen', () => {
  it('writes the clear-viewport + clear-scrollback + cursor-home escape sequence on a TTY', () => {
    const stream = makeStream(true);
    clearScreen(stream);
    expect(stream.write).toHaveBeenCalledTimes(1);
    expect(stream.write).toHaveBeenCalledWith('\x1b[2J\x1b[3J\x1b[H');
  });

  it('writes nothing when the stream is not a TTY', () => {
    const stream = makeStream(false);
    clearScreen(stream);
    expect(stream.write).not.toHaveBeenCalled();
  });
});
