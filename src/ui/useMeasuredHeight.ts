import { useLayoutEffect, useRef, useState } from 'react';
import { measureElement, type DOMElement } from 'ink';

/**
 * Returns `[ref, height]`. Attach `ref` to a `<Box>` to read its rendered
 * row count after layout.
 *
 * The first render returns `0` because layout hasn't happened yet. Callers
 * MUST tolerate this — typically by clamping with `Math.max(MIN, total - height)`
 * so the first frame still produces a usable viewport. The second render
 * (microseconds later) reports the true height.
 *
 * Re-measures after every commit. Cheap — Ink already laid the tree out.
 */
export function useMeasuredHeight(): [React.RefObject<DOMElement | null>, number] {
  const ref = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const m = measureElement(ref.current);
    if (m.height !== height) setHeight(m.height);
  });

  return [ref, height];
}
