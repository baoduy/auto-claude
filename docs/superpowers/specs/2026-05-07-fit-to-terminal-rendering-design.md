# Fit-to-Terminal Rendering — Design

**Status:** Draft
**Date:** 2026-05-07
**Scope:** Wizard select screen (`src/ui/App.tsx`, `src/ui/ItemList.tsx`)

## Problem

The install wizard renders into a fixed-size canvas (alternate screen buffer).
The current viewport math in `ItemList` reserves a static `RESERVED_ROWS = 12`
for chrome (header, breadcrumb, group headers, indicators, footer). This is an
estimate — when the actual chrome differs (figlet width, breadcrumb wrap, multi-
group pages, MCP-not-available banner) the rendered output overflows the
terminal and the cursor row scrolls off the bottom. The user has no way to
recover because alt-screen has no scrollback.

The wizard must always fit the current terminal, including after a live resize.

## Goals

1. **Exact fit at the current size** — chrome height is *measured*, not
   estimated. Item rows are clamped to the remaining space.
2. **Live resize reactivity** — drag the terminal taller/shorter and the
   visible item count adjusts on the next frame.
3. **Hard overflow guard** — the item area is wrapped in
   `overflow="hidden"` so a measurement bug can never spill the screen.
4. **No regression** in existing viewport behaviour: cursor stays centred,
   `↑ N more above` / `↓ N more below` indicators show when clipped.

## Non-goals

- Animated scrolling.
- Re-rendering on column changes (item rows wrap horizontally if too narrow;
  out of scope).
- Restructuring the other screens (`scope`, `confirm`, `run`, `done`) — they
  are short and don't overflow.

## Architecture

Three small units, each with one responsibility:

### `src/ui/useTerminalRows.ts` — hook

```ts
export function useTerminalRows(): number
```

- Returns `process.stdout.rows ?? 24`.
- Subscribes to `process.stdout.on('resize')` on mount.
- Unsubscribes on unmount.
- Triggers a re-render whenever the terminal is resized.
- Single source of truth for "how tall is the terminal right now".

### `src/ui/useMeasuredHeight.ts` — hook

```ts
export function useMeasuredHeight(): [React.RefObject<DOMElement>, number]
```

- Returns `[ref, height]`. Caller attaches the ref to a `<Box>`.
- Uses `useLayoutEffect` + Ink's `measureElement` to read the box's rendered
  row count after layout.
- Re-measures on every render (cheap; Ink already laid out).
- First render returns `0` before layout. Caller MUST tolerate this — App
  uses `Math.max(MIN_VISIBLE, …)` to keep the viewport usable on frame 1.

### `src/ui/ItemList.tsx` — modify

- Replace internal `terminalRows` / `RESERVED_ROWS` math with an explicit
  `viewportRows: number` prop.
- Keep the cursor-centred windowing logic.
- Allocate rows internally for what `ItemList` itself renders:
  - Footer: 3 rows
  - Above-indicator: 1 row when `aboveCount > 0`
  - Below-indicator: 1 row when `belowCount > 0`
  - Group headers: 1 row per visible group (description omitted on the
    select screen — see Tradeoffs)
- Item rows = `viewportRows − footer − indicators − groupHeaders`,
  clamped to `MIN_VISIBLE` (5).
- Wrap item rows in `<Box flexDirection="column" overflow="hidden">` as a
  hard physical cap.

### `src/ui/App.tsx` — modify

```tsx
const totalRows = useTerminalRows();
const [chromeRef, chromeHeight] = useMeasuredHeight();

return (
  <Box flexDirection="column">
    <Box ref={chromeRef} flexDirection="column">
      <Header variant="compact" />
      <KindPageBreadcrumb ... />
      {!repoRoot && hasMcpItems && safePageIndex === 0 && (
        <Text dimColor>MCP items require a project (no repo detected).</Text>
      )}
    </Box>
    <ItemList viewportRows={Math.max(MIN_VISIBLE, totalRows - chromeHeight)} ... />
  </Box>
);
```

Only the `select` screen wires up the measured viewport. Other screens render
as before.

## Data flow

```
useTerminalRows()  ──►  totalRows (re-renders on stdout 'resize')
                            │
chromeRef ──► measureElement ──► chromeHeight
                            │
                            ▼
   viewportRows = max(MIN_VISIBLE, totalRows − chromeHeight)
                            │
                            ▼
   <ItemList viewportRows={…} cursor={…} … />
       │
       ├─ allocate: footer + indicators + group headers
       ├─ remaining → item rows, window centred on cursor
       └─ <Box overflow="hidden"> caps the item area
```

User keystroke (↑/↓) → cursor state changes → re-render with same
`viewportRows`, sliding window. Resize → `useTerminalRows` fires → re-render
with updated `viewportRows`. Both paths converge on the same render function.

## Testing

| Test | Type | Asserts |
|---|---|---|
| `useTerminalRows.test.ts` — emits new value on resize | unit | After `process.stdout.emit('resize')` the hook returns the new `rows` |
| `useTerminalRows.test.ts` — listener cleanup | unit | After unmount, `process.stdout.listenerCount('resize')` is unchanged |
| `ItemList.test.tsx` — viewportRows prop | integration | Existing 4 viewport tests reworked to pass `viewportRows` directly; assertions about which `Item{N}` strings appear unchanged |
| `ItemList.test.tsx` — overflow guard | integration | Render with deliberately too-small `viewportRows` (e.g. 4); item area shows `MIN_VISIBLE` items, no extras leak |

`useMeasuredHeight` is not unit-tested in isolation — it requires a real Ink
renderer; covered indirectly through manual smoke-testing.

## Tradeoffs

- **Group descriptions on the select screen:** dropping per-group
  `description` text saves 1 row per group and removes a measurement
  variable. Descriptions remain on `confirm` if/when needed. Acceptable
  loss — the breadcrumb already names the kind, and group names are
  self-explanatory.
- **First-frame conservatism:** before layout, `chromeHeight` is 0, so the
  first frame uses the full terminal height for items. Acceptable: the
  second frame (microseconds later) corrects.
- **Resize debouncing:** none. Ink's reconciler is fast enough that a
  rapid drag won't queue. If we see flicker we can add a 16ms debounce.

## Risks

- Ink's `measureElement` returning stale heights if the chrome itself
  changes (e.g. switching pages re-renders the breadcrumb). Mitigation:
  `useLayoutEffect` runs after every commit, so the next render sees the
  updated height.
- `process.stdout` listener leaks across mounts. Mitigation: `useEffect`
  cleanup; verified by test.
- `overflow="hidden"` not supported on every Ink version. Mitigation:
  Ink ≥ 5 supports it; pinned in `package.json`.

## File inventory

| File | Status |
|---|---|
| `src/ui/useTerminalRows.ts` | new |
| `src/ui/useMeasuredHeight.ts` | new |
| `src/ui/ItemList.tsx` | modify (replace RESERVED_ROWS path) |
| `src/ui/App.tsx` | modify (wire chrome measurement on select screen) |
| `tests/ui/useTerminalRows.test.ts` | new |
| `tests/ui/ItemList.test.tsx` | modify |
