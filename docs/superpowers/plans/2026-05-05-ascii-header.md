# ASCII Art Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent figlet-based "Auto Claude" header to the install wizard — splash variant on the `select` screen, compact 1-line wordmark on every other screen.

**Architecture:** A single new presentational component `src/ui/Header.tsx` with `variant: 'splash' | 'compact'`. `App.tsx` is refactored so all five screens render through one wrapper that places the header above the screen body. figlet output is computed once at module load.

**Tech Stack:** TypeScript (ESM), Ink 7, React 19, figlet (+ @types/figlet), vitest, ink-testing-library.

**Spec:** [docs/superpowers/specs/2026-05-05-ascii-header-design.md](../specs/2026-05-05-ascii-header-design.md)

---

## File Structure

- `package.json` — add `figlet` dep + `@types/figlet` devDep
- `src/ui/Header.tsx` — **new**, the only header component (presentational, no state)
- `src/ui/App.tsx` — refactor 5 screen returns into one wrapper that hosts `<Header>`
- `tests/ui/Header.test.tsx` — **new**, unit tests for both variants + TTY/narrow fallbacks
- `tests/ui/App.test.tsx` — update assertions to tolerate the header line above each screen

---

## Task 1: Add figlet dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install figlet and types**

Run:
```bash
pnpm add figlet
pnpm add -D @types/figlet
```

- [ ] **Step 2: Verify install**

Run: `pnpm typecheck`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add figlet for ASCII header"
```

---

## Task 2: Header component — splash variant (TDD)

**Files:**
- Create: `src/ui/Header.tsx`
- Test: `tests/ui/Header.test.tsx`

- [ ] **Step 1: Write the failing splash-variant test**

Create `tests/ui/Header.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Header } from '../../src/ui/Header.js';

describe('<Header>', () => {
  let originalIsTTY: boolean | undefined;
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
  });

  it('splash variant renders multi-line figlet output and the tagline', () => {
    const { lastFrame } = render(<Header variant="splash" />);
    const out = lastFrame() ?? '';
    // figlet output is multi-line ASCII art — assert at least 3 lines and the tagline
    expect(out.split('\n').length).toBeGreaterThanOrEqual(3);
    expect(out).toContain('curated tools & plugins for Claude Code');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/Header.test.tsx`
Expected: FAIL — `Cannot find module '../../src/ui/Header.js'`.

- [ ] **Step 3: Implement Header.tsx (splash only, minimal)**

Create `src/ui/Header.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import figlet from 'figlet';

export type HeaderVariant = 'splash' | 'compact';
export interface HeaderProps {
  variant: HeaderVariant;
}

const ORANGE = '#D97706';
const TAGLINE = 'curated tools & plugins for Claude Code';

let figliedAutoClaude = '';
try {
  figliedAutoClaude = figlet.textSync('Auto Claude', { font: 'Standard' });
} catch {
  figliedAutoClaude = 'Auto Claude';
}

export function Header({ variant }: HeaderProps): React.JSX.Element | null {
  if (!process.stdout.isTTY) return null;

  const narrow = (process.stdout.columns ?? 80) < 40;
  const effective: HeaderVariant = narrow ? 'compact' : variant;

  if (effective === 'splash') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={ORANGE}>{figliedAutoClaude}</Text>
        <Text dimColor>{TAGLINE}</Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1}>
      <Text color={ORANGE}>✱ </Text>
      <Text>auto-claude</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/ui/Header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Header.tsx tests/ui/Header.test.tsx
git commit -m "feat(ui): add Header component (splash variant)"
```

---

## Task 3: Header component — compact variant + edge cases

**Files:**
- Modify: `tests/ui/Header.test.tsx` (add cases)

- [ ] **Step 1: Add failing tests for compact, narrow, and non-TTY**

Append inside the `describe('<Header>')` block in `tests/ui/Header.test.tsx`:

```tsx
  it('compact variant renders one line containing "auto-claude" and the ✱ glyph', () => {
    const { lastFrame } = render(<Header variant="compact" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('auto-claude');
    expect(out).toContain('✱');
    // Single visual line of content (plus possible trailing newline)
    expect(out.split('\n').filter((l) => l.trim().length > 0)).toHaveLength(1);
  });

  it('splash falls back to compact when terminal is narrower than 40 columns', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 30, configurable: true });
    const { lastFrame } = render(<Header variant="splash" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('auto-claude');
    expect(out).not.toContain('curated tools & plugins for Claude Code');
  });

  it('renders nothing when stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const splash = render(<Header variant="splash" />);
    const compact = render(<Header variant="compact" />);
    expect((splash.lastFrame() ?? '').trim()).toBe('');
    expect((compact.lastFrame() ?? '').trim()).toBe('');
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm vitest run tests/ui/Header.test.tsx`
Expected: PASS — the implementation in Task 2 already covers compact, narrow, and non-TTY. If any test fails, fix `src/ui/Header.tsx` minimally rather than the test.

- [ ] **Step 3: Commit**

```bash
git add tests/ui/Header.test.tsx
git commit -m "test(ui): cover Header compact, narrow-terminal, and non-TTY paths"
```

---

## Task 4: Wire Header into App.tsx

**Files:**
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Refactor App.tsx render to a single wrapper with Header**

Replace the entire return block (lines ~95–130) of `src/ui/App.tsx` with the following. Keep all logic above unchanged.

Add this import at the top, alongside the other UI imports:

```tsx
import { Header } from './Header.js';
```

Replace the screen-rendering tail of the component with:

```tsx
  const headerVariant: 'splash' | 'compact' = screen === 'select' ? 'splash' : 'compact';

  let body: React.JSX.Element;
  if (screen === 'select') {
    body = <ItemList items={orderedForUI} states={initialStates} selected={selected} cursor={cursor} />;
  } else if (screen === 'scope') {
    body = <PluginScopePrompt cursor={scopeCursor} hasRepo={!!repoRoot} />;
  } else if (screen === 'confirm') {
    const uninstallItems = toUninstallIds.map((id) => items.find((i) => i.id === id)!);
    const installItems = orderForInstall(newSelected.map((id) => items.find((i) => i.id === id)!));
    const lines: string[] = [];
    for (const it of [...uninstallItems].reverse()) {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      lines.push(`Uninstall ${it.name}${scope}`);
    }
    for (const it of installItems) {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      lines.push(`Install ${it.name}${scope}`);
    }
    body = <ConfirmSummary lines={lines} />;
  } else if (screen === 'run') {
    body = <ProgressLog events={events} />;
  } else {
    body = (
      <Box flexDirection="column">
        <ProgressLog events={events} />
        {runError && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red">Run failed: {runError}</Text>
            <Text dimColor>See the failure event above for the stderr tail.</Text>
          </Box>
        )}
        <Box marginTop={1}><PostInstallPanel events={events} /></Box>
        <Box marginTop={1}><Text dimColor>enter to exit</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header variant={headerVariant} />
      {body}
    </Box>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run the existing App tests**

Run: `pnpm vitest run tests/ui/App.test.tsx`
Expected: Two scenarios — either still PASS (if the assertions on `'Tools'` and `'How should plugins be installed?'` are substring matches, the header above won't break them) or FAIL because the rendered frame layout changed. If FAIL, do NOT change the assertions yet — that's Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat(ui): mount persistent Header above every wizard screen"
```

---

## Task 5: Update App tests for the header

**Files:**
- Modify: `tests/ui/App.test.tsx`

- [ ] **Step 1: Confirm App tests state**

Run: `pnpm vitest run tests/ui/App.test.tsx`
If they PASS, skip to Step 4 (still commit a no-op? no — skip the whole task and proceed to Task 6).
If they FAIL, continue.

- [ ] **Step 2: Add a header presence assertion and keep existing assertions**

In `tests/ui/App.test.tsx`, in both `it(...)` blocks, after each `expect(lastFrame()).toContain(...)` for the screen body, add an assertion that the header is present. For example, in the first test add after line 20:

```tsx
expect(lastFrame()).toContain('auto-claude'); // header (splash figlet contains "Auto Claude" → lowercased wordmark only present in compact)
```

Wait — the splash variant's figlet contains "Auto Claude" but the compact wordmark `auto-claude` is lowercase. To assert presence of *either*, use a regex:

```tsx
expect(lastFrame()).toMatch(/auto[- ]?claude/i);
```

Apply this assertion in both tests, alongside the existing `toContain` calls.

- [ ] **Step 3: Run App tests**

Run: `pnpm vitest run tests/ui/App.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/App.test.tsx
git commit -m "test(ui): assert Header rendered above each screen"
```

---

## Task 6: Full test + typecheck + smoke

**Files:** none modified.

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS (all tests, including the four other test files unchanged).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS — `dist/` produced without errors.

- [ ] **Step 4: Manual smoke**

Run: `node dist/cli.js`
Expected: Wizard launches, splash figlet "Auto Claude" appears in orange above the item list with the dimmed tagline. Move cursor down with ↓, toggle a plugin with space, press enter to advance — header collapses to `✱ auto-claude` on the scope/confirm/run/done screens.

If the figlet output looks too tall in your terminal, change the font in `src/ui/Header.tsx` from `'Standard'` to `'Small'`, rebuild, smoke again. Commit only if changed.

- [ ] **Step 5: Commit (if smoke required a font change)**

```bash
git add src/ui/Header.tsx
git commit -m "tweak(ui): use Small figlet font for tighter header"
```

---

## Self-Review Notes

- **Spec coverage:** Header component ✓ Task 2/3. Splash on select / compact on others ✓ Task 4. Persistent across screens ✓ Task 4. figlet direct ✓ Task 1/2. Orange `#D97706` ✓ Task 2. Tagline dimmed ✓ Task 2. Non-TTY null ✓ Task 3. Narrow-terminal fallback ✓ Task 3. Tests in `tests/ui/` ✓ Task 2/3/5. App.tsx refactor ✓ Task 4. No banner on `--help`/`--version` ✓ (not touched).
- **Type consistency:** `HeaderVariant` defined in Task 2, referenced as `'splash' | 'compact'` literal in Task 4 — match.
- **Placeholders:** none.
