# Fit-to-Terminal Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wizard `select` screen always fit the current terminal — chrome height is *measured*, item area is clamped to remaining space, and the layout reacts to live `resize` events.

**Architecture:** Two new React hooks (`useTerminalRows`, `useMeasuredHeight`) feed an explicit `viewportRows` prop into a reworked `ItemList`. `App.tsx` measures its own header+breadcrumb chrome and computes `viewportRows = totalRows − chromeHeight`. The item area is wrapped in `<Box overflow="hidden">` as a hard physical cap.

**Tech Stack:** TypeScript (ESM), Ink 5 (`measureElement`, `useStdout`, `<Box overflow>`), React 18 (`useLayoutEffect`, `useEffect`, `useState`), Vitest + ink-testing-library.

**Spec:** `docs/superpowers/specs/2026-05-07-fit-to-terminal-rendering-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/ui/useTerminalRows.ts` | new | React hook: returns current `process.stdout.rows`, re-renders on `'resize'` |
| `src/ui/useMeasuredHeight.ts` | new | React hook: `[ref, height]` — measures a `<Box>`'s rendered row count |
| `src/ui/ItemList.tsx` | modify | Take `viewportRows` prop, drop `RESERVED_ROWS`/`terminalRows`, allocate rows internally for footer/indicators/group headers, drop group `description`, wrap items in `overflow="hidden"` |
| `src/ui/App.tsx` | modify | On `select` screen, measure chrome via `useMeasuredHeight`, read terminal rows via `useTerminalRows`, pass `viewportRows` to `ItemList` |
| `tests/ui/useTerminalRows.test.ts` | new | Resize event triggers update; listener removed on unmount |
| `tests/ui/ItemList.test.tsx` | modify | Existing 4 viewport tests rewired to drive `viewportRows`; 1 new overflow-guard test |

---

## Task 1: `useTerminalRows` hook

**Files:**
- Create: `src/ui/useTerminalRows.ts`
- Test: `tests/ui/useTerminalRows.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/useTerminalRows.test.ts`:

```ts
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useTerminalRows } from '../../src/ui/useTerminalRows.js';

function Probe({ onValue }: { onValue: (n: number) => void }) {
  const rows = useTerminalRows();
  onValue(rows);
  return <Text>{String(rows)}</Text>;
}

afterEach(() => {
  // Restore stdout.rows to whatever it was so other tests aren't affected.
  vi.restoreAllMocks();
});

describe('useTerminalRows', () => {
  it('returns process.stdout.rows on mount (or 24 fallback)', () => {
    const observed: number[] = [];
    render(<Probe onValue={(n) => observed.push(n)} />);
    expect(observed[0]).toBe(process.stdout.rows ?? 24);
  });

  it('re-renders with the new value when stdout emits "resize"', () => {
    const observed: number[] = [];
    const original = process.stdout.rows;
    Object.defineProperty(process.stdout, 'rows', { value: 30, configurable: true });

    render(<Probe onValue={(n) => observed.push(n)} />);
    expect(observed.at(-1)).toBe(30);

    Object.defineProperty(process.stdout, 'rows', { value: 12, configurable: true });
    process.stdout.emit('resize');

    expect(observed.at(-1)).toBe(12);

    Object.defineProperty(process.stdout, 'rows', { value: original, configurable: true });
  });

  it('removes its resize listener on unmount', () => {
    const before = process.stdout.listenerCount('resize');
    const { unmount } = render(<Probe onValue={() => {}} />);
    expect(process.stdout.listenerCount('resize')).toBe(before + 1);
    unmount();
    expect(process.stdout.listenerCount('resize')).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/useTerminalRows.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/useTerminalRows.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/useTerminalRows.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/ui/useTerminalRows.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useTerminalRows.ts tests/ui/useTerminalRows.test.ts
git commit -m "feat(ui): add useTerminalRows hook for reactive terminal height"
```

---

## Task 2: `useMeasuredHeight` hook

**Files:**
- Create: `src/ui/useMeasuredHeight.ts`

(No standalone unit test — `measureElement` requires a real Ink renderer; this hook is exercised end-to-end by the `ItemList` integration tests in Task 4 and the manual smoke step at the end.)

- [ ] **Step 1: Write the implementation**

Create `src/ui/useMeasuredHeight.ts`:

```ts
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
export function useMeasuredHeight(): [React.RefObject<DOMElement>, number] {
  const ref = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const m = measureElement(ref.current);
    if (m.height !== height) setHeight(m.height);
  });

  return [ref, height];
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — no type errors. (`React.RefObject<DOMElement>` is the correct ref type for Ink's `<Box ref>`.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/useMeasuredHeight.ts
git commit -m "feat(ui): add useMeasuredHeight hook wrapping ink measureElement"
```

---

## Task 3: Rework `ItemList` to take `viewportRows`

**Files:**
- Modify: `src/ui/ItemList.tsx`

This task changes the public prop shape (`terminalRows` → `viewportRows`) and the internal allocation. The existing `ItemList.test.tsx` will fail until Task 4 updates the tests.

- [ ] **Step 1: Replace the props interface**

In `src/ui/ItemList.tsx`, replace lines 7–15 (`ItemListProps` interface) with:

```ts
export interface ItemListProps {
  catalog: Catalog;
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
  showBack?: boolean;
  /** Total rows the list (items + group headers + indicators + footer) is
   *  allowed to occupy. Computed by the parent from the terminal height
   *  minus measured chrome. */
  viewportRows: number;
}
```

- [ ] **Step 2: Replace the constants**

Replace lines 63–68 (the `RESERVED_ROWS` block + `MIN_VISIBLE`) with:

```ts
/** Rows the footer hint occupies (marginTop=1 + 2 lines = 3). */
const FOOTER_ROWS = 3;
/** Minimum visible items so the viewport stays usable on tiny terminals. */
const MIN_VISIBLE = 3;
```

- [ ] **Step 3: Replace the function signature and viewport math**

Replace lines 70–93 (the function signature through the `belowCount` line) with:

```ts
export function ItemList({ catalog, states, selected, cursor, showBack = false, viewportRows }: ItemListProps): React.JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));

  // Flatten items with global indices so we can window them while preserving
  // group structure for rendering.
  const flat: { item: CatalogItem; group: CatalogGroup; idx: number }[] = [];
  let i = 0;
  for (const g of catalog.groups) {
    for (const it of g.items) {
      flat.push({ item: it, group: g, idx: i });
      i++;
    }
  }
  const totalItems = flat.length;
  const groupCount = catalog.groups.length;

  // Allocate rows: footer is fixed; indicators take 1 row each when shown;
  // each visible group header takes 1 row. Worst case (every group visible
  // + both indicators) gives the smallest item budget — start there and
  // grow if windowing means fewer groups are actually visible.
  const indicatorBudget = 2; // assume both ↑/↓ indicators in worst case
  const groupHeaderBudget = groupCount; // 1 per group, worst case
  const itemBudget = Math.max(
    MIN_VISIBLE,
    viewportRows - FOOTER_ROWS - indicatorBudget - groupHeaderBudget,
  );
  const visibleCount = Math.min(totalItems, itemBudget);
  const half = Math.floor(visibleCount / 2);
  const maxStart = Math.max(0, totalItems - visibleCount);
  const viewStart = Math.max(0, Math.min(cursor - half, maxStart));
  const viewEnd = Math.min(totalItems, viewStart + visibleCount);

  const aboveCount = viewStart;
  const belowCount = Math.max(0, totalItems - viewEnd);
```

- [ ] **Step 4: Drop the per-group description and wrap the item area in `overflow="hidden"`**

Replace lines 130–155 (the entire `return (...)`) with:

```tsx
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" overflow="hidden">
        {aboveCount > 0 && (
          <Text dimColor>↑ {aboveCount} more above</Text>
        )}
        {groupsInView.map(({ group: g, items }) => (
          <Box key={g.id} flexDirection="column">
            <Text bold color={COLORS.group}>
              {g.name}
              {g.kind === 'pick-one' ? <Text dimColor> (pick one)</Text> : null}
            </Text>
            {items.map(({ item, idx }) => renderItem(item, g, idx))}
          </Box>
        ))}
        {belowCount > 0 && (
          <Text dimColor>↓ {belowCount} more below</Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {GLYPHS.cursor} navigate ↑↓ · space toggle · ← back / → next · enter continue · q quit
        </Text>
        <Text dimColor>uncheck an installed item to uninstall · [{GLYPHS.locked}] = no uninstaller</Text>
      </Box>
    </Box>
  );
}
```

Note: the per-group `marginTop={1}` is removed (eats rows) and the per-group
`description` line is dropped (per spec §Tradeoffs). The breadcrumb above
identifies the kind, and group names remain.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS for `ItemList.tsx` itself. `App.tsx` will fail because it still passes `terminalRows` — that's fixed in Task 5. Other files unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ItemList.tsx
git commit -m "refactor(ui): drive ItemList viewport from explicit viewportRows prop"
```

---

## Task 4: Update `ItemList` tests for the new prop

**Files:**
- Modify: `tests/ui/ItemList.test.tsx`

- [ ] **Step 1: Replace the existing viewport test block (lines 75–133)**

Open `tests/ui/ItemList.test.tsx` and replace the `describe('ItemList viewport (cursor follows window)', ...)` block (currently the last block in the file) with:

```tsx
describe('ItemList viewport (cursor follows window)', () => {
  // 20 items in one group — far more than fits in any reasonable viewport.
  const longCatalog: Catalog = {
    version: 2, updatedAt: '2026-05-07',
    groups: [{
      id: 'big', name: 'Big group', kind: 'pick-many',
      items: Array.from({ length: 20 }, (_, n) => ({
        id: `i${n}`, name: `Item${n}`, description: `desc-${n}`,
        kind: 'plugin' as const, defaultScope: 'global' as const,
        detect: { command: 'true' }, install: { command: 'true' },
      })),
    }],
  };

  // viewportRows = 12 → after FOOTER (3) + indicators (2) + group header (1)
  // → item budget = 6.
  it('clips above and below when the cursor is in the middle', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={10} viewportRows={12} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/more above/);
    expect(frame).toMatch(/more below/);
    expect(frame).toContain('Item10');
    expect(frame).not.toContain('Item0 ');
    expect(frame).not.toContain('Item19');
  });

  it('does not show "more above" at the top of the list', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={0} viewportRows={12} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/more above/);
    expect(frame).toMatch(/more below/);
    expect(frame).toContain('Item0');
  });

  it('does not show "more below" at the bottom of the list', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={19} viewportRows={12} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/more above/);
    expect(frame).not.toMatch(/more below/);
    expect(frame).toContain('Item19');
  });

  it('shows all items when the viewport is large enough', () => {
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={0} viewportRows={100} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/more above/);
    expect(frame).not.toMatch(/more below/);
    expect(frame).toContain('Item0');
    expect(frame).toContain('Item19');
  });

  it('clamps to MIN_VISIBLE when viewportRows is unreasonably small', () => {
    // viewportRows = 4 leaves negative budget after fixed chrome — clamp to MIN_VISIBLE=3.
    const { lastFrame } = render(
      <ItemList catalog={longCatalog} states={[]} selected={new Set()} cursor={5} viewportRows={4} />
    );
    const frame = lastFrame() ?? '';
    // Cursor item must be present; some items must be hidden.
    expect(frame).toContain('Item5');
    expect(frame).toMatch(/more above/);
    expect(frame).toMatch(/more below/);
  });
});
```

- [ ] **Step 2: Update the three earlier tests in the same file that build an `ItemList` without explicit rows**

In the same file, the earlier `describe` blocks render `ItemList` with no row prop. Add `viewportRows={100}` to each so they exercise the "fits everything" path. Specifically, change:

```tsx
<ItemList catalog={mcpCatalog} states={[]} selected={new Set()} cursor={0} />
```
to
```tsx
<ItemList catalog={mcpCatalog} states={[]} selected={new Set()} cursor={0} viewportRows={100} />
```

…and apply the same `viewportRows={100}` addition to the three renders inside the `describe('ItemList grouped layout', …)` block.

- [ ] **Step 3: Run the file to verify it passes**

Run: `pnpm vitest run tests/ui/ItemList.test.tsx`
Expected: PASS — 8 tests green (3 existing layout + 1 mcp glyph + 4 viewport including new clamp test).

- [ ] **Step 4: Commit**

```bash
git add tests/ui/ItemList.test.tsx
git commit -m "test(ui): drive ItemList viewport tests from viewportRows prop"
```

---

## Task 5: Wire `App.tsx` to measure chrome and pass `viewportRows`

**Files:**
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Add the new imports**

At the top of `src/ui/App.tsx`, alongside existing imports:

```ts
import { useTerminalRows } from './useTerminalRows.js';
import { useMeasuredHeight } from './useMeasuredHeight.js';
```

- [ ] **Step 2: Use the hooks inside the `App` component**

Inside `App({ ... }: AppProps)`, near the top of the component body (after the existing `useApp()` line is fine), add:

```ts
  const totalRows = useTerminalRows();
  const [chromeRef, chromeHeight] = useMeasuredHeight();
  const viewportRows = Math.max(8, totalRows - chromeHeight);
```

(`8` is a generous floor that keeps `ItemList`'s own `MIN_VISIBLE = 3` clamp engaged on tiny terminals; the real math runs when `chromeHeight > 0`.)

- [ ] **Step 3: Wrap the select-screen chrome in the measured `<Box>` and pass `viewportRows`**

Find the `else if (screen === 'select')` branch (currently around lines 244–263). Replace its `body = ( ... )` assignment with:

```tsx
    body = (
      <Box flexDirection="column">
        <Box flexDirection="column" ref={chromeRef}>
          <KindPageBreadcrumb kinds={activeKinds} index={safePageIndex} />
          {!repoRoot && hasMcpItems && safePageIndex === 0 && (
            <Text dimColor>MCP items require a project (no repo detected).</Text>
          )}
        </Box>
        <ItemList
          catalog={pageCatalog}
          states={adjustedStates}
          selected={selected}
          cursor={cursor}
          showBack={safePageIndex > 0}
          viewportRows={viewportRows}
        />
      </Box>
    );
```

Note: the `Header` is rendered once by the outer return below — it is *outside* this measured box. We measure only the screen-specific chrome (breadcrumb + optional banner). The compact header takes a known 2 rows; account for it by adjusting the `viewportRows` calculation in step 4.

- [ ] **Step 4: Subtract the outer Header rows from `viewportRows`**

The compact `<Header />` rendered at the bottom of `App` is *outside* the measured chrome. Update step 2's calculation:

```ts
  const HEADER_ROWS = 2; // compact Header: brand glyph line + marginBottom
  const totalRows = useTerminalRows();
  const [chromeRef, chromeHeight] = useMeasuredHeight();
  const viewportRows = Math.max(8, totalRows - HEADER_ROWS - chromeHeight);
```

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — all 121+ tests green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat(ui): measure chrome height and clamp ItemList viewport to terminal"
```

---

## Task 6: Drop dead `RESERVED_ROWS` reference and verify integration

**Files:** none (audit task).

- [ ] **Step 1: Search for any leftover `terminalRows` or `RESERVED_ROWS` references**

Run: `pnpm exec rg -n 'RESERVED_ROWS|terminalRows' src tests`
Expected: no matches. If any remain, delete them.

- [ ] **Step 2: Run the full suite + typecheck + build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck clean, all tests pass, build emits `dist/`.

- [ ] **Step 3: Manual smoke test**

```bash
pnpm build
node dist/cli.js
```

Verify:
- Wizard launches, alt-screen activates (terminal cleared, splash gone).
- On the **plugin** page (which has the most items), all rows are visible:
  the cursor is on screen, the footer hint is on screen, no rows are
  clipped off the bottom.
- Resize the terminal taller and shorter: the visible item count changes
  on the next keystroke (or immediately, depending on terminal).
- Press `q`: alt-screen exits and the previous prompt is restored.

- [ ] **Step 4: Commit any cleanup, or skip if nothing changed**

If the rg search surfaced anything to delete, commit those changes:

```bash
git add -p
git commit -m "chore(ui): remove dead viewport-estimation references"
```

Otherwise, no commit needed — proceed to wrap-up.

---

## Self-Review

Spec coverage check:
- ✅ §Goals 1 (exact fit) — Task 3 + Task 5 (measured chrome → exact item budget).
- ✅ §Goals 2 (resize reactivity) — Task 1 (`useTerminalRows` `'resize'` listener).
- ✅ §Goals 3 (overflow guard) — Task 3 step 4 (`<Box overflow="hidden">`).
- ✅ §Goals 4 (no regression) — Task 4 (existing viewport tests rewired).
- ✅ §Architecture three units — Tasks 1, 2, 3 + 5.
- ✅ §Testing matrix — Task 1 (3 tests), Task 4 (5 tests including overflow guard), Task 6 step 3 (manual smoke).
- ✅ §Tradeoffs (drop group descriptions) — Task 3 step 4.

No placeholders, all code blocks complete, type names consistent (`ItemListProps.viewportRows`, `useTerminalRows()`, `useMeasuredHeight()`, `chromeRef`/`chromeHeight`, `MIN_VISIBLE`, `FOOTER_ROWS`, `HEADER_ROWS`).
