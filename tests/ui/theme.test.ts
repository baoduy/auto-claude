import { describe, it, expect } from 'vitest';
import { COLORS, paint } from '../../src/ui/theme.js';

describe('theme', () => {
  it('exposes a blue COLORS.group', () => {
    expect(COLORS.group).toBe('blue');
  });

  it('paint("group") emits the blue ANSI escape on a TTY', () => {
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      expect(paint('hi', 'group')).toBe('\x1b[34mhi\x1b[0m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
    }
  });
});
