# auto-claude `default` subcommand — design

**Date:** 2026-05-05
**Status:** Approved (brainstorm)
**Author:** Steven (with Claude)

## Motivation

Operators need to provision Claude Code's curated tools/plugins onto every device in the company from a bash automation script. The existing `npx auto-claude` flow is an interactive Ink wizard — it requires a TTY, prompts for plugin scope, and asks the user to paste post-install messages into Claude. None of that works in a fleet rollout.

We add a non-interactive subcommand whose contract is: *"install every catalog item marked as a default, globally, idempotently, with log-friendly output and a meaningful exit code."* The same subcommand exposes a `--list` flag for inspecting which items are currently marked as defaults.

We also consolidate the two physical catalog files (`src/catalog/bundled.json` shipped in npm + remote `catalog.json` on GitHub) into a single source-of-truth `catalog.json` at the repo root, eliminating drift.

## Non-goals

- Per-user overrides of the default set (no separate `~/.config/auto-claude/config.json`). The catalog itself is the source of truth.
- Project-scoped silent install — `default` always installs plugins globally.
- Surfacing post-install Claude prompts to a human. Fleet machines have no operator at the keyboard; prompts are suppressed with a one-line notice.

## CLI surface

Two new entry points in `src/cli.ts`:

```
auto-claude default [--refresh-catalog]
auto-claude default --list             # alias: -l
```

Existing root command (interactive wizard) and `status` / `remove` / `update` subcommands are untouched.

### Exit codes for `auto-claude default`

| Code | Meaning |
|------|---------|
| 0    | Every default item is installed (or was already installed). |
| 1    | One or more items failed to install. Other items were still attempted. |
| 2    | Catalog could not be loaded, or another fatal pre-flight error. |

`auto-claude default --list` always exits `0` (read-only).

## Data model change

Add an optional `default?: boolean` field to `CatalogItem` in `src/types.ts` and `src/catalog/schema.ts`.

- Absent or `false` → item is not part of the default set.
- `true` → included in `auto-claude default`.
- Schema requires a real boolean. The string `"true"` is rejected by Zod.

The first set of items in `catalog.json` flagged with `default: true` will be chosen as part of the implementation; no item identities are baked into this design.

## Catalog file consolidation

**Today.** `src/catalog/bundled.json` (shipped via `import ... with { type: 'json' }`) + a remote `catalog.json` fetched from GitHub raw at runtime. They drift independently.

**Proposed.**

- Single source-of-truth at the **repo root**: `catalog.json`.
- `src/catalog/loader.ts` imports it directly as the bundled fallback. `src/catalog/bundled.json` is deleted.
- The remote URL keeps pointing at the same path on `main`, so the file shipped in the npm tarball and the file served by GitHub are byte-identical at release time.
- `package.json` `"files"` is updated to include `catalog.json` so it lands inside the published tarball.
- `tsup` build is unchanged (JSON is imported, not bundled separately).

**Why repo root?** The remote URL already reads `catalog.json` from the repo root. Putting the file there means one canonical path used by both the bundled import and the GitHub raw URL — no copy step in CI. It also makes the catalog discoverable to non-developers editing it.

## `commands/default.ts` — silent installer

New file `src/commands/default.ts`. It does **not** mount Ink. It exports two async functions: `runDefault({ refreshCatalog })` and `runDefaultList({ refreshCatalog })`.

### `runDefault` flow

1. `loadCatalog({ refresh: refreshCatalog })`. On loader error, print to stderr and exit `2`.
2. Filter to `items.filter(i => i.default === true)`. If the set is empty, print `default: nothing to do` and exit `0`.
3. Order via existing `engine/ordering.ts` (tools before plugins, etc.).
4. Build an `InstallPlan` with `pluginScope: 'global'` and `repoRoot: undefined`.
5. Invoke the existing `engine/executor.ts`. Attach a CLI event listener (not Ink) that writes one line per `EngineEvent`:
   - `item-start` → `→ <id>` to stdout
   - `item-success` → `✓ <id>` to stdout, or `↺ <id> already installed` when the item was detected as already installed and the executor short-circuited
   - `item-failure` → `✗ <id>: <reason>` to stderr (reason is the stderr tail surfaced by `executor.ts`)
   - `post-shell-start` / `post-shell-end` → forward to stdout, prefixed with `<id>:`
   - `post-prompt` → suppressed; log `ⓘ <id>: post-install Claude prompt skipped (run \`auto-claude\` interactively to see it)` to stdout
   - `done` → final summary line `default: N ok, M failed, K skipped`
6. No ANSI colors when `!process.stdout.isTTY`.
7. Exit code derived from the running tally: any failure → `1`, otherwise `0`.

Idempotency is inherited from the executor's existing `detect` step. Re-running on a healthy machine is a no-op except for the log lines.

### `runDefaultList` flow

1. Load catalog (same as above).
2. Filter to `default === true`.
3. Run `engine/detect.ts` against each (concurrently is fine).
4. Print two sections, grouped by `kind`:

   ```
   Default tools:
     rtk          installed
     gitnexus     not installed

   Default plugins:
     claude-mem   installed
     superpowers  installed
   ```

   When `!process.stdout.isTTY`, separate columns with a single tab to keep `grep`/`awk` clean.
5. Exit `0`.

## Reuse map

Nothing about install/uninstall/update mechanics is reinvented:

| Concern                     | Source                          |
|-----------------------------|---------------------------------|
| Catalog load + cache + remote fetch | `src/catalog/loader.ts` (unchanged behavior, single import path) |
| Detection                   | `src/engine/detect.ts` (unchanged) |
| Install execution + post-install actions | `src/engine/executor.ts` (unchanged) |
| Topological ordering        | `src/engine/ordering.ts` (unchanged) |
| Event contract              | `EngineEvent` in `src/types.ts` (unchanged) |

The new file is a non-Ink consumer of the same event stream the wizard already drives.

## Tests

- `tests/catalog/schema.test.ts` — accepts `default: true | false`, rejects `"true"`.
- `tests/catalog/loader.test.ts` — update existing tests for the renamed bundled import.
- `tests/commands/default.test.ts` — new:
  - filters to only `default: true` items
  - skips already-installed items, reports as skipped, exit `0`
  - one item failing → exit `1`, remaining items still attempted
  - empty default set → exit `0`, prints "nothing to do"
  - `--list` output shape, grouping, and exit `0`
  - `--refresh-catalog` is forwarded to loader
  - `post-prompt` events are suppressed but logged as a notice
- `tests/e2e/default.e2e.test.ts` — invokes `dist/cli.js default --list` against a fixture catalog and asserts the output text.

## Migration

Single commit:

1. Move `src/catalog/bundled.json` → `catalog.json` at repo root.
2. Update the loader import path; remove dead reference to `bundled.json`.
3. Update `package.json` `"files"` to include `catalog.json`.
4. Update existing loader tests that reference the old path.
5. Add `default: true` to the catalog entries that should ship as defaults.

A second commit adds the `default` subcommand, schema field, and tests.

## Open questions

None at design time. Item identities marked with `default: true` are an implementation-time decision and are not part of this design.
