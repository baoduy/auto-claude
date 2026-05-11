# Interactive install streaming, disabled items, and default-command removal

Date: 2026-05-11
Branch: `baoduy/tool-installation-user-input`

## Motivation

Three pain points in current auto-claude:

1. **Silent installs deadlock.** Several catalog commands (`claude plugin marketplace add <gh-repo>`, `cavemem install`, `npx claude-mem install`, `graphify install`, `openspec init`, `brew install --cask …` sudo, `rtk init -g`) emit interactive prompts. The Ink wizard owns the TTY during `executeInstall`, so prompts never reach the user; the process hangs. Today only `snip setup` opts into the `interactive: true` deferred mechanism — it does not generalize.
2. **`default` command is obsolete.** `npx auto-claude default` and the `default: true` catalog flag were built for fleet automation. With groups + per-user catalog tuning that flow no longer makes sense and adds maintenance cost.
3. **No way to hide catalog items.** When the maintainer wants to deprecate or temporarily hide an item, the only option is to delete it from `catalog.json`, which loses history and breaks pinned references.

## Goals

- Allow every install / uninstall / post-install command to interact with the user on the real TTY.
- Remove the `default` command and `default: true` field entirely.
- Let the catalog author hide items or whole groups from the wizard, status, update, and remove flows by setting `disabled: true` on the catalog entry.

## Non-goals

- End-user-configurable disabling (no user config file). Disabling lives in `catalog.json` only.
- Keeping a pretty Ink ProgressLog during install. We trade live UI for raw stdio so prompts work.
- Preserving the deferred-action mechanism (`DeferredInteractive`, `action.interactive`). All post-install becomes interactive by default.

---

## Section 1 — Remove `default` command

### Schema

- `CatalogItem.default?: boolean` — **deleted** from `src/types.ts` and the Zod schema in `src/catalog/schema.ts`.

### Code

- Delete `src/commands/default.ts`.
- Delete the `default` Commander subcommand registration in `src/cli.ts` (both `default` and `default --list`).
- Strip every `"default": true` occurrence from the bundled `catalog.json`.

### Tests + docs

- Delete `tests/commands/default.*` and any e2e fixtures that drive the default flow.
- README: drop `default` rows from the command table and remove the "default items" section.

### Migration

- Users who had `npx auto-claude default` in fleet scripts will see "unknown command". Document in PR body.

---

## Section 2 — Stream interactive install

### Flow change

Wizard phases (`select` → `scope` → `confirm`) stay inside Ink. Once the user confirms:

1. Ink unmounts via `useApp().exit()`.
2. Plain Node assumes control. Prints header `▶ Installing N items…`.
3. For each item in install order:
   - Prints `── [i/N] <name> ──`.
   - Spawns the install command with `stdio: 'inherit'`, `shell: true`, `cwd` resolved as today.
   - On non-zero exit: prints `✗ failed (exit N)` and prompts `[c]ontinue / [a]bort? ` via `readline`. Abort = `process.exit(1)`.
   - Runs every `postInstall` action of kind `shell` with the same inherited-stdio path. `claude-prompt` actions are buffered into a summary list.
4. Final summary prints succeeded/failed counts + each buffered `claude-prompt` message.

### Code shape

- New module `src/engine/stream-runner.ts`:
  - `streamInstall(plan: InstallPlan, opts: { onClaudePrompt?: (label, value) => void }): Promise<{ succeeded: string[]; failed: string[] }>`.
  - Internally uses `execa(cmd, { stdio: 'inherit', shell: true, cwd })`.
  - Owns header/footer/banner prints. No event emission — direct stdout.
- `src/engine/executor.ts` keeps the event-based path for `--dry-run` and unit tests. Stream path supersedes it for real runs.
- `src/commands/install.tsx`: after the Ink `confirm` step, call `app.exit()`, then `await streamInstall(plan)` from the parent process.
- `EngineEvent`, `DeferredInteractive`, and `PostInstallAction.interactive` are removed. `ProgressLog.tsx` and `PostInstallPanel.tsx` are no longer used during install (kept only for dry-run output if needed; otherwise deleted).
- Same `streamInstall` is used by `update` and `remove` commands.

### Trade-offs

- Live ProgressLog UI disappears during install. Acceptable — real stdout > pretty UI when prompts are required.
- Tests against `executor.ts` survive (dry-run + event mode). New tests for `stream-runner.ts` mock `execa` and assert the order of spawned commands, abort-on-failure handling, and `claude-prompt` buffering.
- `stdio: 'inherit'` + `shell: true` works on macOS, Linux, and Windows (`cmd.exe` / PowerShell).

---

## Section 3 — Disabled catalog items

### Schema

- `CatalogItem.disabled?: boolean`.
- `CatalogGroup.disabled?: boolean`.
- Both `.optional()` in `src/catalog/schema.ts`.

### Filter

- `src/catalog/loader.ts` runs `filterDisabled(catalog)` after fetch + validate:
  - Drop groups where `disabled === true`.
  - For remaining groups, drop items where `disabled === true`.
  - Drop now-empty groups.
- Filtered catalog feeds every command (install wizard, status, update, remove). No call site changes.

### Behavior

- Items already installed locally but later marked `disabled: true` in the catalog become invisible to the wizard and status. They cannot be uninstalled through auto-claude; the maintainer must un-disable or document manual removal. Acceptable since the catalog author controls the flag.
- `--refresh-catalog` re-fetches the remote catalog but the filter still applies.

### Tests

- `tests/catalog/loader.test.ts`:
  - Disabled item dropped.
  - Disabled group dropped.
  - Group whose every item is disabled is dropped.
  - Non-disabled items in a partially-disabled group remain.

---

## File-by-file impact

| Path | Change |
|---|---|
| `src/types.ts` | Drop `default` field; add `disabled?: boolean` to `CatalogItem` + `CatalogGroup`. Remove `DeferredInteractive`, `EngineEvent` shrinks. |
| `src/catalog/schema.ts` | Mirror type changes. |
| `src/catalog/loader.ts` | Add `filterDisabled` step. |
| `src/cli.ts` | Drop `default` subcommand. |
| `src/commands/default.ts` | Delete. |
| `src/commands/install.tsx` | After Ink confirm, unmount + call `streamInstall`. |
| `src/commands/update.ts` | Switch to `streamInstall`. |
| `src/commands/remove.ts` | Switch to `streamInstall`. |
| `src/engine/executor.ts` | Keep dry-run + event mode. Remove `interactive`/`deferred` paths. |
| `src/engine/stream-runner.ts` | New. |
| `src/ui/ProgressLog.tsx`, `PostInstallPanel.tsx` | Removed from install flow (delete if no other consumer). |
| `catalog.json` | Strip every `"default": true`. |
| `tests/commands/default.*` | Delete. |
| `tests/engine/stream-runner.test.ts` | New. |
| `tests/catalog/loader.test.ts` | Add disabled-filter cases. |
| `README.md` | Drop `default` rows; add `disabled` field doc; note interactive install. |

## Open questions

None. All three sections approved verbally.
