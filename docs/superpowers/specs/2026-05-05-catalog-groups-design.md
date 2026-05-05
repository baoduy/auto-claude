# Catalog Groups & Conflicting Items — Design

**Date:** 2026-05-05
**Status:** Draft
**Scope:** auto-claude catalog v2

## Problem

Some catalog items are functionally exclusive — installing both at once is wrong (or silently bad). The clearest example: a memory backend. `claude-mem` and the new `MemPalace` both inject persistent cross-session memory; running both means double-write, double-recall, and confused tooling. Same story for spec-driven workflows (`spec-kit` vs `open-spec`) and code-intelligence engines (`gitnexus` vs `graphify`).

The current catalog is a flat `items[]` with no way to express exclusivity. The wizard happily lets a user check both `claude-mem` and `mempalace`, install them, and learn the hard way.

We also want to add `MemPalace` to the catalog as part of this change.

## Goals

1. Express **exclusive groups** ("pick exactly one of these") in the catalog data model.
2. Express **collection groups** ("these belong together visually but are independent") for clarity in the UI.
3. Render groups as radio-buttons (pick-one) or checkbox lists (pick-many) in the wizard, with a group header.
4. **Auto-swap** when a user picks a different member of a pick-one group: queue the previously-installed member for uninstall in the same run.
5. Detect **out-of-band conflicts** at startup (user has both installed already) and force a resolution before proceeding.
6. Add **MemPalace** as a new item under the `memory` group.
7. `auto-claude status` and `default --list` group their output by group header.

## Non-goals

- Cross-group dependencies (e.g., "rtk requires snip"). Out of scope.
- Soft conflicts / warnings without enforcement.
- Backwards compatibility with v1 catalogs. We rev to v2 and update the bundled catalog in the same change.

## Data model

`src/types.ts`:

```ts
export type GroupKind = 'pick-one' | 'pick-many';

export interface CatalogGroup {
  id: string;                    // e.g. "memory", "spec", "code-intelligence"
  name: string;                  // human-readable header, e.g. "Memory backend"
  description?: string;          // optional one-liner shown under the header
  kind: GroupKind;
  items: CatalogItem[];          // members live INSIDE the group
}

export interface Catalog {
  version: 2;                    // bumped from 1
  updatedAt: string;
  groups: CatalogGroup[];        // replaces top-level `items`
}
```

`CatalogItem` is unchanged. Items no longer live at the catalog root — every item lives inside exactly one group. Standalone items (no functional siblings) live in a `pick-many` group, possibly of size one.

### Schema invariants (`src/catalog/schema.ts`)

Validated via Zod `.superRefine`:

1. Every item `id` is unique across all groups.
2. Every group `id` is unique.
3. For a group with `kind: 'pick-one'`: at most one member has `default: true`.

A v1 catalog (top-level `items[]`, no `groups`) fails parsing — there is no auto-migration. Only the bundled v2 catalog and a v2 remote catalog are supported.

## Group layout

| id | name | kind | members |
|---|---|---|---|
| `memory` | Memory backend | pick-one | claude-mem, **mempalace** |
| `spec` | Spec-driven workflow | pick-one | spec-kit, open-spec |
| `code-intelligence` | Code intelligence / KG | pick-one | gitnexus, graphify |
| `docs` | Documentation providers | pick-many | context7, microsoft-docs |
| `context-optimization` | Context & token optimization | pick-many | rtk, context-mode, codeburn |
| `core-plugins` | Core Claude Code plugins | pick-many | superpowers, claude-code-setup, plugin-dev |
| `visual` | Visual tooling | pick-many | snip |
| `project-templates` | Project-specific templates | pick-many | drunk-app, dknet-minimal |

Note that the `memory` group mixes a `plugin` (claude-mem) and a `tool` (mempalace). Group kind constrains *selection semantics*, not *item kind*; the engine continues to install each according to its own `install` spec.

## New item: MemPalace

Investigation of `https://github.com/MemPalace/mempalace`: MemPalace is a **pip-installed Python tool** that wires into Claude Code via an MCP server with auto-save hooks. It is **not** a Claude plugin. Catalog entry:

```json
{
  "id": "mempalace",
  "name": "MemPalace",
  "description": "Persistent cross-session memory for Claude Code (pip + MCP server)",
  "kind": "tool",
  "homepage": "https://github.com/MemPalace/mempalace",
  "defaultScope": "global",
  "detect":    { "command": "mempalace --version" },
  "install":   { "command": "pip install mempalace" },
  "uninstall": { "command": "pip uninstall -y mempalace" },
  "update":    { "command": "pip install --upgrade mempalace" },
  "postInstall": [
    { "type": "shell", "value": "mempalace init", "requiresRepo": true, "label": "Initializing MemPalace in repo" },
    { "type": "claude-prompt", "label": "Register MemPalace MCP server",
      "value": "Run: claude mcp add mempalace -- mempalace mcp" }
  ]
}
```

The exact MCP-registration command will be confirmed against MemPalace docs during implementation. If a one-shot install command exists analogous to `graphify install`, we prefer that and drop the prompt.

`mempalace` is **not** marked `default: true`. `claude-mem` keeps `default: true` as the existing fleet default; the schema invariant guarantees only one default per pick-one group.

## UI changes (`src/ui/`)

### `ItemList.tsx`
- Iterate `catalog.groups` in declaration order. For each group:
  - Render a header line with `group.name`. Append `(pick one)` for pick-one groups.
  - Render `group.description` in dim on the next line if present.
  - Render members indented two spaces under the header.
- Member glyphs:
  - `pick-many`: `[x]` / `[ ]` (today's behavior).
  - `pick-one`: `(◉)` / `( )` (radio).
- Already-installed items remain pre-checked and locked, same as today.
- Keyboard:
  - Up/down navigates across all members regardless of group boundaries.
  - Space on a `pick-many` member: toggle.
  - Space on a `pick-one` member: select that one and deselect all other members of the same group (in-memory; uninstall queueing happens at confirm time).
  - Space on an already-installed locked item: no-op.
  - Enter: continue. q: quit.
- A `pick-one` group may end up with zero members selected if none was preselected and the user doesn't pick one — that's allowed; the user simply isn't installing memory.

### Auto-swap at confirm
When `App.tsx` builds the `InstallPlan`:
- For each pick-one group, if a member is currently installed (per detection) AND the user has selected a different member of the same group, add the previously-installed member to `InstallPlan.uninstall`.
- The confirm screen renders this explicitly:
  ```
  Will install:
    + mempalace
  Will uninstall (replaced):
    - claude-mem  (replaced by mempalace)
  ```

### Out-of-band conflict screen
After detection, before `select`:
- Walk the groups; for each `pick-one` group with >1 installed member, push a conflict screen.
- The screen lists the conflicting members and asks the user to keep one. The unselected members are queued for uninstall before the normal `select` step.
- If multiple groups have conflicts, walk them in order, one screen each.

This is a new wizard state: `conflict` → (resolved) → `select` → … the rest is unchanged.

## Engine changes (`src/engine/`)

- `detect.ts` — unchanged. Items are detected independently; the loader provides the group lookup.
- `ordering.ts` — when a pick-one swap happens, ensure the uninstall of A runs before the install of B. The current uninstall-before-install phase ordering already gives us this; add a test to lock it in.
- `executor.ts` — unchanged.

## Catalog loader (`src/catalog/loader.ts`)

- Parse expects `version: 2`. v1 inputs reject with a clear error pointing at the migration.
- After parsing, build:
  - `Map<string, CatalogGroup>` keyed by item id (used by UI for "what group am I in").
  - `CatalogItem[]` flat view (used by detect/executor/status code that doesn't care about grouping).
- The 24h cache key is unchanged.

## CLI changes

### `status`
Output grouped by group header:
```
Memory backend (pick-one):
  ✓ claude-mem
  ✗ mempalace

Spec-driven workflow (pick-one):
  ✗ spec-kit
  ✓ open-spec

Documentation providers:
  ✗ context7
  ✓ microsoft-docs
…
```

### `default --list`
Same grouped layout, with a `(default)` annotation on members where `default: true`.

### `default` (silent install)
Unchanged behavior — installs everything with `default: true`. The schema invariant guarantees no two defaults inside a single pick-one group, so silent fleet installs cannot create out-of-band conflicts.

## Migration

`catalog.json` and a new `src/catalog/bundled.json` are rewritten to v2 in this same change. `bundled.json` becomes the offline fallback (loader already references it; today the file is missing — this design adds it).

## Testing

- `tests/catalog/schema.test.ts` — invariants: duplicate ids, multiple `default: true` in pick-one group, missing groups, v1 input rejected.
- `tests/catalog/loader.test.ts` — group lookup map populated correctly; flat view matches sum of group items.
- `tests/ui/ItemList.test.tsx` — radio rendering, pick-one space deselects siblings, pick-many space toggles, locked installed items.
- `tests/ui/App.test.tsx` — auto-swap appears in `InstallPlan.uninstall`; conflict screen appears when detection reports two installed members in a pick-one group; conflict resolution feeds into uninstall.
- `tests/commands/status.test.ts` — grouped output format.
- `tests/engine/ordering.test.ts` — swap puts uninstall-A before install-B.
- `tests/e2e/` — happy-path swap: pre-install claude-mem, run wizard selecting mempalace, assert claude-mem uninstalled and mempalace installed.

## Open questions / to-confirm during implementation

1. **MemPalace MCP registration**: confirm the exact `claude mcp add` command from MemPalace docs (the placeholder above is a guess). If MemPalace ships a one-shot setup, prefer that.
2. **Empty pick-one groups**: confirmed allowed — user can opt out of having any memory backend.
