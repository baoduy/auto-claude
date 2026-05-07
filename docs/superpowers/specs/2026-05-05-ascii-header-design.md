# ASCII Art Header for auto-claude TUI

**Date:** 2026-05-05
**Status:** Design approved, awaiting user spec review

## Goal

Add a branded ASCII art header to the `auto-claude` interactive wizard so it has the same kind of visual identity that `claude` and `gh` CLIs project. The header should be present across the entire wizard flow without crowding the wizard's working area.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where it appears | Persistent — every screen of the wizard | User wants the brand visible throughout, not just on entry |
| Visual content | Wordmark "Auto Claude" rendered as figlet ASCII art | User-selected; recognizable, scales, no mascot upkeep |
| Header strategy | Splash on `select`, collapses to 1-line compact wordmark on `scope` / `confirm` / `run` / `done` | Persistent presence without eating vertical space on log-heavy screens |
| Library | `figlet` (direct) | Actively maintained (March 2026), tiny surface, no Ink-specific wrapper to rot |
| Font | `Standard` (figlet default) | Readable, friendly, ~5 lines; fall back to `Small` if smoke test shows it's too tall |
| Color | Orange `#D97706` (Anthropic-adjacent) | Brand nod without exact-logo mimicry; reads on both light and dark terminals |
| Tagline | `curated tools & plugins for Claude Code`, dimmed, under the splash only | Context for first-time users; the compact variant doesn't need it |
| Non-TTY | Header returns `null` | Defensive — Ink already gates on TTY, but explicit is better |
| Narrow terminals | If `process.stdout.columns < 40`, force compact variant on every screen | Prevents the figlet from wrapping and looking broken |

## Architecture

A single new component, `src/ui/Header.tsx`, with two variants. `App.tsx` wraps every screen's render output with the appropriate header above it.

### Component contract

```tsx
// src/ui/Header.tsx
export interface HeaderProps {
  variant: 'splash' | 'compact';
}

export function Header({ variant }: HeaderProps): React.JSX.Element | null;
```

- **`splash`** — multi-line figlet of "Auto Claude" in orange, with a dimmed tagline below it. Used only on the `select` screen.
- **`compact`** — a single line: `✱ auto-claude` with the `✱` colored orange and the wordmark in default text color. Used on `scope`, `confirm`, `run`, `done`.
- Both wrapped in `<Box marginBottom={1}>` so they sit cleanly above their screen's content.
- Returns `null` when `process.stdout.isTTY` is false.
- When `process.stdout.columns < 40`, the splash variant internally degrades to compact rendering (caller doesn't need to know).

### Integration with `App.tsx`

Currently `App.tsx` has five `if (screen === ...)` returns. Refactor so the screen body is computed once and the header is composed around it:

```tsx
const headerVariant: HeaderVariant = screen === 'select' ? 'splash' : 'compact';

const body = (() => {
  if (screen === 'select') return <ItemList ... />;
  if (screen === 'scope') return <PluginScopePrompt ... />;
  if (screen === 'confirm') return <ConfirmSummary ... />;
  if (screen === 'run') return <ProgressLog events={events} />;
  // done screen
  return <Box flexDirection="column">...existing done body...</Box>;
})();

return (
  <Box flexDirection="column">
    <Header variant={headerVariant} />
    {body}
  </Box>
);
```

This is a small refactor of `App.tsx` justified by the change: collapsing five near-duplicate return paths into one wrapper. No behavioral change beyond the new header.

### Library usage

```ts
import figlet from 'figlet';

const figliedAutoClaude = figlet.textSync('Auto Claude', { font: 'Standard' });
```

We compute this string **once at module load** in `Header.tsx` (it's static), not on every render. It's then passed into a single `<Text color="#D97706">{figliedAutoClaude}</Text>`.

## Data flow

No changes. Header is presentational only — no props beyond `variant`, no state, no events.

## Error handling

- If `figlet.textSync` ever throws (it shouldn't, the font is bundled), the splash falls back to the compact rendering. Wrapped in a try/catch at module load.
- Non-TTY: `null`. No errors propagated.

## Testing

New: `tests/ui/Header.test.tsx`
- Splash variant rendered output contains the figlet'd "Auto Claude" or the literal string fragment "Auto" somewhere in its output (figlet output varies by font, so assert on a substring like a recognizable letter pattern from the chosen font, or on the tagline being present).
- Compact variant output contains the literal `auto-claude` string.
- Mock `process.stdout.columns = 30` → splash variant degrades to compact.
- Mock `process.stdout.isTTY = false` → both variants render nothing.

Updated: existing `tests/ui/` tests for `App.tsx` (if they exist and assert on rendered output) — adjust expectations to account for the header line(s) above each screen. Do **not** suppress the header in tests; verifying it's there is part of the contract.

## Files touched

- `package.json` — add `figlet` and `@types/figlet`
- `src/ui/Header.tsx` — new
- `src/ui/App.tsx` — refactor screen returns, add header
- `tests/ui/Header.test.tsx` — new
- `tests/ui/App.test.tsx` if present — update expectations

## Out of scope (YAGNI)

- No animation or spinner on the splash
- No user-configurable font / color / theme
- No header on `--help` / `--version` / non-interactive command output (`status`, `remove --yes`, `update`)
- No light/dark-mode detection
- No localization of the tagline
