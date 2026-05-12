# Catalog: add Claudoscope, drop codeburn from defaults

**Date:** 2026-05-12
**Branch:** `baoduy/add-claudoscope-remove-codeburn`
**Scope:** `catalog.json` only. No code, schema, or UI change.

## Motivation

1. **Add Claudoscope** — native macOS menu-bar app that surfaces Claude Code session analytics, cost estimation, secret scanning, and config health. Useful enough to belong in the curated catalog as an opt-in tool.
2. **Drop codeburn from defaults** — codeburn (TUI token/cost dashboard) currently pre-checks in the install wizard. Heavy install for users who already have a cost dashboard or don't need one. Keep it installable, but stop auto-selecting it.

## Changes

### 1. Add `claudoscope` to `context-optimization` group

Group: `context-optimization` (existing `pick-many` group containing `rtk`, `context-mode`, `codeburn`). Claudoscope's session/cost dashboarding fits this group thematically.

New item, appended after `codeburn` in `groups[].items`:

```json
{
  "id": "claudoscope",
  "name": "Claudoscope",
  "description": "Native macOS menu-bar app — real-time Claude Code session dashboard, cost analytics, secret scanning, config health",
  "kind": "tool",
  "homepage": "https://github.com/cordwainersmith/Claudoscope",
  "defaultScope": "global",
  "default": false,
  "detect": {
    "command": "brew list --cask claudoscope"
  },
  "install": {
    "command": "brew install --cask cordwainersmith/claudoscope/claudoscope"
  },
  "uninstall": {
    "command": "brew uninstall --cask claudoscope"
  },
  "update": {
    "command": "brew upgrade --cask claudoscope"
  }
}
```

**Decisions:**

- `default: false` — heavy app (full macOS install), opt-in only.
- Install via fully-qualified cask name `cordwainersmith/claudoscope/claudoscope` so Homebrew auto-taps `cordwainersmith/claudoscope` without a separate `brew tap` step.
- Detect via `brew list --cask claudoscope` (non-zero exit when missing — matches existing command-detect pattern).
- macOS-only / Apple Silicon-only. No platform-guard field exists in the catalog schema; on Linux or Intel, `brew install` will surface its own error through the engine's stderr tail. Acceptable for an opt-in item.
- No `postInstall` — app launches from `/Applications` or menu bar; no MCP registration or repo init required.

### 2. Flip `codeburn` to `default: false`

Existing entry at `groups[].items[]` (currently in `context-optimization`). Add one line:

```json
"default": false,
```

placed immediately after `"defaultScope": "global"` (matches sibling pattern in `context7`, `microsoft-docs`).

No other field changes. Entry remains installable from the wizard, just no longer pre-checked.

## Non-goals

- No schema changes. `default` and all install fields already exist.
- No new group. `context-optimization` already houses tooling of this shape.
- No engine changes. `brew` is already used (see `rtk` entry).
- No platform-guard field added. Out of scope; tracked separately if ever needed.

## Validation

1. `pnpm typecheck` — no TS changes, expect pass.
2. `pnpm test` — existing catalog schema test (`tests/catalog/`) re-runs against modified `catalog.json`. Schema must still validate.
3. New test in `tests/catalog/` asserting:
   - `claudoscope` exists in `context-optimization` group items with `default: false`.
   - `codeburn` has `default: false`.
4. `pnpm build` — sanity build.
5. Manual smoke: `node dist/cli.js status` — claudoscope should appear, marked not installed (assuming not yet installed).

## Rollout

Single commit on existing branch `baoduy/add-claudoscope-remove-codeburn`. Push to existing PR (or open new one if none).

## Risks

- **Low.** Pure catalog change, additive item + one default flip.
- Brew tap not yet pulled on user machines — handled by fully-qualified cask name.
- Non-macOS users selecting Claudoscope will see `brew install` failure; engine already streams stderr tail. Acceptable since `default: false`.
