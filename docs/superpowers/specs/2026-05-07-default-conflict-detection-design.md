# Default-flow conflict detection and auto-uninstall

## Problem

`runDefaultInstall` (`src/commands/default.ts`) only checks whether each `default: true` item is already installed. It is blind to `pick-one` group drift: if the catalog's `default` flag has moved to a different sibling since the user's previous install (or another tool installed a sibling), `default` will silently install a second member of the group, leaving the host with two mutually-exclusive tools side by side.

The interactive wizard already detects multi-installed `pick-one` siblings via `findConflicts` in `src/ui/App.tsx` and resolves them through `ConflictPrompt`. Default mode has no equivalent.

## Goal

When `npx auto-claude default` runs and the catalog's currently-flagged default for a `pick-one` group is **not** the installed sibling:

1. Uninstall the drifted sibling first (if it has an `uninstall` command).
2. Install the catalog default afterwards.
3. If the drifted sibling has no `uninstall` command, skip the default install for that group and surface a `conflicts` counter — never silently double-install.

Order invariant: **no `default: true` item starts installing while a conflicting sibling is still on disk.**

## Non-goals

- No new `conflictsWith` field on `CatalogItem`. Conflicts remain implied by `pick-one` group membership.
- No catalog schema changes.
- No interactive prompt in default mode. Default is fleet-automation, fully non-interactive (no `ConflictPrompt`, no scope picker, no enter-to-continue).
- No change to interactive wizard conflict UX. The wizard's existing `ConflictPrompt` plus `forcedUninstallIds` plus executor phase ordering already enforces uninstall-before-install for resolved conflicts (see `src/engine/executor.ts:62`, phase 1 = uninstall, phase 2 = install).
- No detection for non-`pick-one` group drift, orphan items, or single-sibling drift in the wizard.

## Architecture

### New helper: `findDefaultConflicts`

Add to `src/catalog/groups.ts`:

```ts
export interface DefaultConflict {
  groupId: string;
  groupName: string;
  defaultItem: CatalogItem;       // item flagged default:true in pick-one group
  driftedSiblings: CatalogItem[]; // installed siblings != defaultItem
}

export function findDefaultConflicts(
  catalog: Catalog,
  installedIds: Set<string>,
): DefaultConflict[];
```

Rules:

- Group must have `kind: 'pick-one'`.
- Group must contain exactly one `default: true` item — if zero or two-plus, the group is skipped (ambiguous policy, no conflict reported).
- Conflict iff at least one sibling other than `defaultItem` is in `installedIds`.
- If only `defaultItem` is installed, no conflict.
- Pure helper, no I/O, unit-testable.

### Changes to `runDefaultInstall`

`DefaultInstallResult` gains a counter:

```ts
export interface DefaultInstallResult {
  ok: number;
  failed: number;
  skipped: number;
  conflicts: number; // drift cases skipped because the drifted sibling lacked an uninstall command
}
```

Flow:

1. Detect states (existing call to `deps.detect`).
2. `const conflicts = findDefaultConflicts(catalog, installedIds)`.
3. For each `DefaultConflict`, partition `driftedSiblings`:
   - `isShellItem(sib) && sib.uninstall` → push to `swapUninstalls: CatalogItem[]`.
   - else → log a warning, add `defaultItem.id` to `Set<string> blockedDefaults`, increment `result.conflicts`.
4. **Pre-loop swap-uninstall pass.** Single call:
   ```ts
   await executeInstall(
     { selected: [], uninstall: swapUninstalls, scope: 'global', repoRoot: null },
     { run: deps.run, onEvent: wrappedOnEvent, dryRun: !!deps.dryRun, record: ... },
   );
   ```
   Executor's existing phase-1 logic uninstalls every entry before the per-item install loop runs. Skip the call when `swapUninstalls` is empty.
5. Refresh `installedIds` by removing every uninstalled sibling id.
6. Per-item install loop (existing). Before installing each `item`, additionally skip if `blockedDefaults.has(item.id)`.
7. Summary line gains `conflicts`:
   ```
   default: 3 ok, 0 failed, 1 skipped, 1 conflicts
   ```
8. Exit code unchanged: `process.exitCode = 1` only when `result.failed > 0`. A `conflicts > 0` outcome is non-fatal — fleet runs keep going, signal is in the counter and log lines.

### Logging

Using existing `paint` / `GLYPHS` helpers:

- Drift with uninstall available:
  ```
  ⚠ conflict in "{groupName}": {sibling.id} drift from default {defaultId}; uninstalling sibling
  ↦ uninstall {sibling.id}
  ✓ {sibling.id} uninstalled
  ↦ {defaultId}
  ✓ {defaultId}
  ```
- Drift, no uninstall command:
  ```
  ⚠ conflict in "{groupName}": {sibling.id} installed but has no uninstall command; skipping {defaultId}
  ```
- Dry-run: same lines, plus each shell command emitted as `  $ <cmd>` via the existing `record:` callback. No process executes.

## Constraints / invariants

- Default flow runs fully unattended. No prompts, no TTY input. Same posture as `remove --yes`.
- A `default: true` item never begins installing while a `pick-one` sibling is still installed. Enforced twice: (a) bulk swap-uninstall happens before the install loop, and (b) executor phase 1 runs all uninstalls before any install in the same plan.
- The interactive wizard's behavior is unchanged.
- `runDefaultInstall` remains pure-ish: all side effects flow through `deps.run`, `deps.log`, `deps.err`, `deps.onEvent`. Tests substitute mocks.

## Test plan

`tests/catalog/groups.test.ts` — `findDefaultConflicts`:

- `pick-one` group, default installed alone → no conflict.
- `pick-one` group, only drifted sibling installed → conflict with one `driftedSiblings` entry.
- `pick-one` group, default + sibling both installed → conflict (sibling listed in `driftedSiblings`).
- `pick-one` group with no `default: true` item → no conflict.
- `pick-one` group with two `default: true` items → no conflict (ambiguous policy, helper bails).
- Non-`pick-one` group with multiple installed members → no conflict.

`tests/commands/default.test.ts` — `runDefaultInstall`:

- Drift with uninstall: assert via mock `run` call order that the sibling's uninstall command runs before the default's install command. Final `installedIds` excludes sibling. `result.ok` counts the default install. `result.conflicts === 0`.
- Drift without uninstall: default not installed, `result.conflicts === 1`, `result.failed === 0`, `process.exitCode` not touched.
- Multiple groups in conflict: all swap-uninstalls execute before the first install.
- Dry-run with conflict: `$ <uninstall>` line precedes `$ <install>` line, no commands actually execute.
- No-conflict run unchanged from existing behavior.

Existing `tests/ui/ConflictPrompt.test.tsx` and the interactive flow tests stay green — no source changes there.

## Files touched

- `src/catalog/groups.ts` — add `DefaultConflict` + `findDefaultConflicts`.
- `src/commands/default.ts` — extend `DefaultInstallResult`, add pre-loop swap-uninstall pass, add `blockedDefaults` skip, update summary, update logging.
- `tests/catalog/groups.test.ts` — new cases.
- `tests/commands/default.test.ts` — new cases.

No catalog schema changes. No UI changes. No CLI option changes.
