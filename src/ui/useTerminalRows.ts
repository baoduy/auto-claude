import { useEffect, useState } from 'react';

const FALLBACK_ROWS = 24;

/**
 * Returns the current row count of `process.stdout`, re-rendering whenever
 * the stream emits `'resize'`. Falls back to 24 when stdout is not a TTY.
 *
 * Single source of truth for "how tall is the terminal right now?". Used by
 * the wizard to clamp the item viewport so it always fits the screen.
 */
export function useTerminalRows(): number {
  const [rows, setRows] = useState<number>(process.stdout.rows ?? FALLBACK_ROWS);

  useEffect(() => {
    const onResize = () => setRows(process.stdout.rows ?? FALLBACK_ROWS);
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return rows;
}
