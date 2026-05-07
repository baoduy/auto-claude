# Default-flow Conflict Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npx auto-claude default` detect `pick-one` group drift, auto-uninstall conflicting siblings before installing the catalog default, and report unresolvable cases via a new `conflicts` counter.

**Architecture:** Add a pure helper `findDefaultConflicts` in `src/catalog/groups.ts`. Extend `runDefaultInstall` in `src/commands/default.ts` with a pre-loop swap-uninstall pass (reusing `executeInstall` so the executor's existing phase-1 uninstall ordering is preserved) and a `blockedDefaults` skip set for siblings that lack an `uninstall` command.

**Tech Stack:** TypeScript (ESM), vitest, existing `executeInstall` engine, existing `paint`/`GLYPHS` UI helpers.

---

## File Structure

- **Create**
  - none
- **Modify**
  - `src/catalog/groups.ts` — add `DefaultConflict` interface and `findDefaultConflicts` function
  - `src/commands/default.ts` — extend `DefaultInstallResult`, add pre-loop swap-uninstall pass, skip blocked defaults, update summary line, add warn logs
- **Test**
  - `tests/catalog/groups.test.ts` — extend with `findDefaultConflicts` cases
  - `tests/commands/default.test.ts` — extend with conflict cases

No catalog schema, CLI option, UI, or executor changes.

---

### Task 1: Add `findDefaultConflicts` helper (failing test)

**Files:**
- Test: `tests/catalog/groups.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/catalog/groups.test.ts`:

```ts
import { findDefaultConflicts } from '../../src/catalog/groups.js';

describe('findDefaultConflicts', () => {
  const mkTool = (id: string, isDefault = false, withUninstall = true): CatalogItem => ({
    id, name: id, description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: 'true' }, install: { command: `install-${id}` },
    ...(withUninstall ? { uninstall: { command: `uninstall-${id}` } } : {}),
    ...(isDefault ? { default: true } : {}),
  });

  const cat = (groups: CatalogGroup[]): Catalog => ({ version: 2, updatedAt: '2026-05-07', groups });

  it('returns no conflict when only the default sibling is installed', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b')], { kind: 'pick-one' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a']))).toEqual([]);
  });

  it('returns a conflict when only a drifted sibling is installed', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b')], { kind: 'pick-one' }),
    ]);
    const out = findDefaultConflicts(c, new Set(['b']));
    expect(out).toHaveLength(1);
    expect(out[0]!.groupId).toBe('mem');
    expect(out[0]!.defaultItem.id).toBe('a');
    expect(out[0]!.driftedSiblings.map((s) => s.id)).toEqual(['b']);
  });

  it('returns a conflict when default and a drifted sibling are both installed', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b'), mkTool('c')], { kind: 'pick-one' }),
    ]);
    const out = findDefaultConflicts(c, new Set(['a', 'b']));
    expect(out).toHaveLength(1);
    expect(out[0]!.driftedSiblings.map((s) => s.id)).toEqual(['b']);
  });

  it('skips pick-one groups with no default flag', () => {
    const c = cat([
      group('mem', [mkTool('a'), mkTool('b')], { kind: 'pick-one' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a', 'b']))).toEqual([]);
  });

  it('skips pick-one groups with multiple default flags (ambiguous)', () => {
    const c = cat([
      group('mem', [mkTool('a', true), mkTool('b', true)], { kind: 'pick-one' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a', 'b']))).toEqual([]);
  });

  it('ignores non-pick-one groups even when multiple members are installed', () => {
    const c = cat([
      group('extras', [mkTool('a', true), mkTool('b')], { kind: 'pick-many' }),
    ]);
    expect(findDefaultConflicts(c, new Set(['a', 'b']))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/catalog/groups.test.ts`
Expected: FAIL with `findDefaultConflicts is not a function` / import error.

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/catalog/groups.test.ts
git commit -m "test(catalog): add findDefaultConflicts cases (failing)"
```

---

### Task 2: Implement `findDefaultConflicts`

**Files:**
- Modify: `src/catalog/groups.ts`

- [ ] **Step 1: Add interface and function**

Append to `src/catalog/groups.ts`:

```ts
export interface DefaultConflict {
  groupId: string;
  groupName: string;
  defaultItem: CatalogItem;
  driftedSiblings: CatalogItem[];
}

/**
 * Detect `pick-one` groups where the catalog's `default: true` sibling is not
 * the installed one (or is installed alongside another sibling). Skips groups
 * that have zero or multiple `default: true` items (ambiguous policy).
 */
export function findDefaultConflicts(
  catalog: Catalog,
  installedIds: Set<string>,
): DefaultConflict[] {
  const out: DefaultConflict[] = [];
  for (const g of catalog.groups) {
    if (g.kind !== 'pick-one') continue;
    const defaults = g.items.filter((i) => i.default === true);
    if (defaults.length !== 1) continue;
    const defaultItem = defaults[0]!;
    const driftedSiblings = g.items.filter(
      (i) => i.id !== defaultItem.id && installedIds.has(i.id),
    );
    if (driftedSiblings.length === 0) continue;
    out.push({ groupId: g.id, groupName: g.name, defaultItem, driftedSiblings });
  }
  return out;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test tests/catalog/groups.test.ts`
Expected: PASS for all `findDefaultConflicts` cases plus prior cases.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/catalog/groups.ts
git commit -m "feat(catalog): add findDefaultConflicts helper"
```

---

### Task 3: Extend `DefaultInstallResult` with `conflicts` counter (failing test)

**Files:**
- Test: `tests/commands/default.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/commands/default.test.ts` (inside the existing `describe('runDefaultInstall', ...)` block):

```ts
  it('initializes the conflicts counter at zero on a clean run', async () => {
    const result = await runDefaultInstall({
      items: [mkItem('rtk')],
      detect: async () => [{ itemId: 'rtk', installed: false }],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(result.conflicts).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/commands/default.test.ts`
Expected: FAIL — `result.conflicts` is `undefined`, expected `0`.

---

### Task 4: Add `conflicts` to `DefaultInstallResult`

**Files:**
- Modify: `src/commands/default.ts`

- [ ] **Step 1: Edit interface and initial value**

In `src/commands/default.ts`, change:

```ts
export interface DefaultInstallResult {
  ok: number;
  failed: number;
  skipped: number;
}
```

to:

```ts
export interface DefaultInstallResult {
  ok: number;
  failed: number;
  skipped: number;
  conflicts: number;
}
```

And change:

```ts
const result: DefaultInstallResult = { ok: 0, failed: 0, skipped: 0 };
```

to:

```ts
const result: DefaultInstallResult = { ok: 0, failed: 0, skipped: 0, conflicts: 0 };
```

Update the summary line near the end of `runDefaultInstall` from:

```ts
deps.log(paint(`default${dryNote}: ${result.ok} ok, ${result.failed} failed, ${result.skipped} skipped`, summaryColor));
```

to:

```ts
deps.log(paint(`default${dryNote}: ${result.ok} ok, ${result.failed} failed, ${result.skipped} skipped, ${result.conflicts} conflicts`, summaryColor));
```

- [ ] **Step 2: Run tests**

Run: `pnpm test tests/commands/default.test.ts`
Expected: prior tests PASS, new conflicts-counter test PASSES.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/default.ts tests/commands/default.test.ts
git commit -m "feat(default): add conflicts counter to DefaultInstallResult"
```

---

### Task 5: Drift with uninstall — sibling uninstalled before default install (failing test)

**Files:**
- Test: `tests/commands/default.test.ts`

- [ ] **Step 1: Add helper + test**

Add near the top of `tests/commands/default.test.ts` (below the existing `mkItem` helper):

```ts
function mkSibling(id: string, withUninstall = true): CatalogItem {
  return {
    id, name: id, description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: `${id} -v` }, install: { command: `install-${id}` },
    ...(withUninstall ? { uninstall: { command: `uninstall-${id}` } } : {}),
  };
}

function mkCatalog(groups: import('../../src/types.js').CatalogGroup[]): Catalog {
  return { version: 2, updatedAt: '2026-05-07', groups };
}
```

Then append (inside the existing `describe('runDefaultInstall', ...)` block):

```ts
  it('uninstalls a drifted pick-one sibling before installing the default', async () => {
    const a = mkItem('a'); // default: true
    const b = mkSibling('b', true); // drifted, has uninstall
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(calls).toEqual(['uninstall-b', 'install-a']);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.conflicts).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/commands/default.test.ts -t 'uninstalls a drifted'`
Expected: FAIL — either `catalog` not accepted by `RunDefaultInstallDeps`, or `calls` only contains `install-a` (sibling not uninstalled).

---

### Task 6: Plumb catalog through `runDefaultInstall`

**Files:**
- Modify: `src/commands/default.ts`

- [ ] **Step 1: Add `catalog` to `RunDefaultInstallDeps`**

In `src/commands/default.ts`, edit `RunDefaultInstallDeps`:

```ts
export interface RunDefaultInstallDeps {
  items: CatalogItem[];
  catalog?: import('../types.js').Catalog;
  repoRoot?: string | null;
  detect: (items: CatalogItem[]) => Promise<InstallState[]>;
  run: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  log: (msg: string) => void;
  err: (msg: string) => void;
  onEvent: (e: EngineEvent) => void;
  dryRun?: boolean;
}
```

`catalog` is optional so existing callers and tests that don't exercise drift logic still compile. When omitted, `runDefaultInstall` skips conflict detection (treated as no conflicts).

- [ ] **Step 2: Pass the loaded catalog from `runDefault`**

Inside `runDefault`, find:

```ts
const result = await runDefaultInstall({
  items: defaults,
  repoRoot,
  detect: ...
```

Add `catalog,` to that object literal:

```ts
const result = await runDefaultInstall({
  items: defaults,
  catalog,
  repoRoot,
  detect: (items) => detectStates(items, undefined, repoRoot),
  ...
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit (no behavior change yet)**

```bash
git add src/commands/default.ts
git commit -m "refactor(default): thread catalog through runDefaultInstall"
```

---

### Task 7: Implement pre-loop swap-uninstall pass

**Files:**
- Modify: `src/commands/default.ts`

- [ ] **Step 1: Add imports**

In `src/commands/default.ts`, change:

```ts
import { executeInstall } from '../engine/executor.js';
```

to:

```ts
import { executeInstall } from '../engine/executor.js';
import { findDefaultConflicts } from '../catalog/groups.js';
import { isShellItem } from '../types.js';
```

- [ ] **Step 2: Replace the body of `runDefaultInstall` after the existing `installedIds` line**

Locate inside `runDefaultInstall`:

```ts
const ordered = orderForInstall(deps.items);
const states = await deps.detect(ordered);
const installedIds = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
```

Immediately after that block, insert the swap-uninstall + blocked-defaults logic:

```ts
const blockedDefaults = new Set<string>();
const swapUninstalls: CatalogItem[] = [];

if (deps.catalog) {
  const conflicts = findDefaultConflicts(deps.catalog, installedIds);
  for (const c of conflicts) {
    for (const sib of c.driftedSiblings) {
      if (isShellItem(sib) && sib.uninstall) {
        swapUninstalls.push(sib);
        deps.log(paint(
          `${GLYPHS.info} conflict in "${c.groupName}": ${sib.id} drift from default ${c.defaultItem.id}; uninstalling sibling`,
          'warn',
        ));
      } else {
        blockedDefaults.add(c.defaultItem.id);
        deps.log(paint(
          `${GLYPHS.info} conflict in "${c.groupName}": ${sib.id} installed but has no uninstall command; skipping ${c.defaultItem.id}`,
          'warn',
        ));
        result.conflicts++;
      }
    }
  }
}

if (swapUninstalls.length > 0) {
  const wrappedOnEventForSwap = (e: EngineEvent) => {
    if (e.type === 'post-prompt') return;
    deps.onEvent(e);
  };
  try {
    await executeInstall(
      { selected: [], uninstall: swapUninstalls, scope: 'global', repoRoot: deps.repoRoot ?? null },
      {
        run: deps.run,
        onEvent: wrappedOnEventForSwap,
        dryRun: !!deps.dryRun,
        record: deps.dryRun ? (cmd) => deps.log(paint(`  $ ${cmd}`, 'dim')) : undefined,
      },
    );
    for (const it of swapUninstalls) installedIds.delete(it.id);
  } catch (e) {
    deps.err(paint(`${GLYPHS.fail} swap-uninstall failed: ${(e as Error).message}`, 'fail'));
    result.failed++;
  }
}
```

- [ ] **Step 3: Skip blocked defaults inside the install loop**

Find the existing per-item loop:

```ts
for (const item of ordered) {
  if (item.kind === 'mcp' && !deps.repoRoot) {
    ...
  }
  if (installedIds.has(item.id)) {
    ...
  }
  deps.log(paint(`${GLYPHS.arrow} ${item.id}`, 'cursor'));
```

Insert a new guard immediately after the `installedIds.has(item.id)` block and before the `deps.log(paint(\`${GLYPHS.arrow} ...\`...))` line:

```ts
  if (blockedDefaults.has(item.id)) {
    // already counted via result.conflicts++ during conflict detection
    continue;
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/commands/default.test.ts -t 'uninstalls a drifted'`
Expected: PASS — `calls` is `['uninstall-b', 'install-a']`.

- [ ] **Step 5: Run full default test file**

Run: `pnpm test tests/commands/default.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/commands/default.ts
git commit -m "feat(default): auto-uninstall drifted pick-one siblings before install"
```

---

### Task 8: Drift without uninstall — block default, count conflict

**Files:**
- Test: `tests/commands/default.test.ts`

- [ ] **Step 1: Add the test**

Append inside the `describe('runDefaultInstall', ...)` block:

```ts
  it('skips the default and bumps conflicts when the drifted sibling has no uninstall command', async () => {
    const a = mkItem('a'); // default: true
    const b = mkSibling('b', false); // drifted, NO uninstall
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const errs: string[] = [];
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: (m) => logs.push(m),
      err: (m) => errs.push(m),
      onEvent: () => {},
    });
    expect(calls).toEqual([]); // nothing executed
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(logs.some((l) => /no uninstall command; skipping a/.test(l))).toBe(true);
  });
```

- [ ] **Step 2: Run test**

Run: `pnpm test tests/commands/default.test.ts -t 'skips the default and bumps conflicts'`
Expected: PASS (the implementation from Task 7 already handles this case).

- [ ] **Step 3: Commit**

```bash
git add tests/commands/default.test.ts
git commit -m "test(default): cover unresolvable drift conflict"
```

---

### Task 9: Multiple conflicts — all uninstalls run before any install

**Files:**
- Test: `tests/commands/default.test.ts`

- [ ] **Step 1: Add the test**

Append inside `describe('runDefaultInstall', ...)`:

```ts
  it('runs all swap-uninstalls before any default install across multiple groups', async () => {
    const a = mkItem('a'); // default in g1
    const x = mkItem('x'); // default in g2
    const b = mkSibling('b', true); // drift in g1
    const y = mkSibling('y', true); // drift in g2
    const catalog: Catalog = mkCatalog([
      { id: 'g1', name: 'G1', kind: 'pick-one', items: [a, b] },
      { id: 'g2', name: 'G2', kind: 'pick-one', items: [x, y] },
    ]);
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [a, x],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
        { itemId: 'x', installed: false },
        { itemId: 'y', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    const lastUninstall = Math.max(calls.indexOf('uninstall-b'), calls.indexOf('uninstall-y'));
    const firstInstall = Math.min(calls.indexOf('install-a'), calls.indexOf('install-x'));
    expect(lastUninstall).toBeGreaterThanOrEqual(0);
    expect(firstInstall).toBeGreaterThan(lastUninstall);
    expect(result.ok).toBe(2);
    expect(result.conflicts).toBe(0);
  });
```

- [ ] **Step 2: Run test**

Run: `pnpm test tests/commands/default.test.ts -t 'runs all swap-uninstalls'`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/commands/default.test.ts
git commit -m "test(default): cover multi-group swap-uninstall ordering"
```

---

### Task 10: Dry-run records swap-uninstall before install

**Files:**
- Test: `tests/commands/default.test.ts`

- [ ] **Step 1: Add the test**

Append inside `describe('runDefaultInstall', ...)`:

```ts
  it('records swap-uninstall before install in dry-run, executes nothing', async () => {
    const a = mkItem('a');
    const b = mkSibling('b', true);
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: (m) => logs.push(m),
      err: () => {},
      onEvent: () => {},
      dryRun: true,
    });
    expect(calls).toEqual([]); // dry-run executes nothing
    const uIdx = logs.findIndex((l) => l.includes('$ uninstall-b'));
    const iIdx = logs.findIndex((l) => l.includes('$ install-a'));
    expect(uIdx).toBeGreaterThanOrEqual(0);
    expect(iIdx).toBeGreaterThan(uIdx);
    expect(result.ok).toBe(1); // dry-run still counts the default as ok
  });
```

- [ ] **Step 2: Run test**

Run: `pnpm test tests/commands/default.test.ts -t 'records swap-uninstall before install in dry-run'`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/commands/default.test.ts
git commit -m "test(default): cover dry-run swap-uninstall ordering"
```

---

### Task 11: Full verification

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: builds cleanly into `dist/`.

- [ ] **Step 4: Smoke check (manual, optional)**

Run: `node dist/cli.js default --dry-run`
Expected: prints summary line ending in `, 0 conflicts` (assuming no drift on the dev machine).

---

## Notes for the implementer

- The interactive wizard is intentionally untouched. Its `findConflicts` (in `src/ui/App.tsx`) covers a different case (multiple `pick-one` siblings already installed) and uses `ConflictPrompt` to ask the user. Default mode never prompts.
- The executor (`src/engine/executor.ts:62`) already runs uninstalls in phase 1 before installs in phase 2. The pre-loop `executeInstall` call in Task 7 leverages that ordering for the swap-uninstalls, while the per-item loop continues to do its own `executeInstall` per default item. Both layers preserve the invariant: no `default: true` item begins installing while a conflicting sibling is still on disk.
- `catalog` is optional on `RunDefaultInstallDeps` so existing tests in `tests/commands/default.test.ts` (which don't construct a catalog) keep passing without edits.
- If a future change wants conflict detection without a real catalog, callers can pass a synthetic `Catalog` containing just the affected groups.
