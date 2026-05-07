import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useTerminalRows } from '../../src/ui/useTerminalRows.js';

function Probe({ onRender }: { onRender: (n: number) => void }) {
  const rows = useTerminalRows();
  onRender(rows);
  return <Text>{String(rows)}</Text>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTerminalRows', () => {
  it('returns process.stdout.rows on mount (or 24 fallback)', () => {
    const renders: number[] = [];
    render(<Probe onRender={(n) => renders.push(n)} />);
    expect(renders[0]).toBe(process.stdout.rows ?? 24);
  });

  it('re-renders with the new value when stdout emits "resize"', async () => {
    const renders: number[] = [];
    const original = process.stdout.rows;

    // Set initial rows to 30
    Object.defineProperty(process.stdout, 'rows', { value: 30, configurable: true });

    // Spy on the resize listener
    const onSpy = vi.spyOn(process.stdout, 'on');

    render(<Probe onRender={(n) => renders.push(n)} />);

    // Wait a tick for initial render
    await new Promise((r) => setTimeout(r, 10));
    expect(renders[0]).toBe(30);

    // Verify that resize listener was registered
    expect(onSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    const resizeHandler = onSpy.mock.calls.find(c => c[0] === 'resize')?.[1] as Function | undefined;
    expect(resizeHandler).toBeDefined();

    // Change rows to 12 and call the handler directly
    Object.defineProperty(process.stdout, 'rows', { value: 12, configurable: true });
    if (resizeHandler) {
      resizeHandler();
    }

    // Wait for state update and re-render
    await new Promise((r) => setTimeout(r, 50));
    expect(renders.at(-1)).toBe(12);

    // Restore original
    if (original !== undefined) {
      Object.defineProperty(process.stdout, 'rows', { value: original, configurable: true });
    }
  });

  it('removes its resize listener on unmount', () => {
    const before = process.stdout.listenerCount('resize');
    const { unmount } = render(<Probe onRender={() => {}} />);
    expect(process.stdout.listenerCount('resize')).toBe(before + 1);
    unmount();
    expect(process.stdout.listenerCount('resize')).toBe(before);
  });
});
