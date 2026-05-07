# Paged install wizard by item kind

**Status:** Design
**Date:** 2026-05-07
**Branch:** `baoduy/paged-install-category-flow`

## Problem

The install wizard renders every catalog group on a single `select` screen. As the catalog has grown (memory backend, spec workflow, observability tools, MCPs, …), this list now overflows a typical terminal viewport, making it hard to scan and easy to miss items.

## Goal

Split the single `select` screen into a sequence of shorter screens — one per item kind (`tool`, `plugin`, `mcp`) — with forward/back navigation between them. Selections persist across pages. The combined plan still feeds the existing `scope → confirm → run → done` flow unchanged.

## Non-goals

- Adding a `skill` kind (deferred — the existing three kinds only).
- Restructuring `CatalogGroup` semantics (pick-one / pick-many remain as-is).
- Changing the engine, executor, ordering, or post-install behavior.
- Rewriting `ItemList` — it is reused with a filtered `groups` subset.

## Design

### Wizard flow

The `Screen` union is unchanged at the type level: `'conflict' | 'select' | 'scope' | 'confirm' | 'run' | 'done'`. The `'select'` screen is now parameterized by a `kindPageIndex` over an `activeKinds` list.

```
conflict?  →  select(kind₀)  ↔  select(kind₁)  ↔  …  →  scope?  →  confirm  →  run  →  done
```

- `enter` advances the page index. From the last page it transitions to `scope` (if `hasPlugin && repoRoot`) or `confirm`, exactly as today.
- `←` (or `b`) decrements the page index. No-op at index 0.
- `space`, `↑`, `↓`, `q` behave as today, scoped to the current page's items.

### Group → page assignment

Each `CatalogGroup` is assigned to exactly one page via:

```ts
pageOf(group) = group.page ?? dominantKind(group)
```

- `group.page` — new optional field on `CatalogGroup`, type `ItemKind`. Lets editors pin a cross-kind group to a specific page.
- `dominantKind(group)` — most-frequent `item.kind` in the group; ties broken `tool > plugin > mcp`.

Items inside a group keep their own `kind` glyph in `ItemList`; the page label is a routing hint, not a per-item filter. So a tool sitting on the plugins page (because the group's `page` is `'plugin'`) still renders with the tool icon.

### `activeKinds(catalog, repoRoot)`

Returns the ordered list of kinds that have at least one assigned group, in the canonical order `['tool', 'plugin', 'mcp']`. Rules:

- A kind is included only if `displayCatalog.groups.some(g => pageOf(g) === kind)`.
- `'mcp'` is excluded when `repoRoot === null` (matches the existing `displayCatalog` filter that drops MCP items in repo-less mode).
- The result drives both the breadcrumb and the page count `(i/N)`.

Empty pages are skipped silently — they never render, and the breadcrumb omits them.

### State (in `App.tsx`)

Selection state is **not** split per page. Paging is purely a render filter, so all existing logic (pick-one mutual exclusion, `effectiveInstalled`, `autoSwapIds`, `allUninstallIds`, conflict resolution) keeps working unchanged across pages.

New state:

```ts
const activeKinds = useMemo(() => computeActiveKinds(displayCatalog, repoRoot), [displayCatalog, repoRoot]);
const [kindPageIndex, setKindPageIndex] = useState(0);
const [pageCursors, setPageCursors] = useState<number[]>(() => activeKinds.map(() => 0));
```

`pageCursors[i]` preserves the cursor row when the user navigates away and back. The existing single `cursor` is removed; reads/writes go through `pageCursors[kindPageIndex]`.

Per-page item slice (used both for cursor bounds and for `ItemList`):

```ts
const pageGroups = useMemo(
  () => displayCatalog.groups.filter(g => pageOf(g) === activeKinds[kindPageIndex]),
  [displayCatalog, activeKinds, kindPageIndex],
);
const pageItems = useMemo(() => pageGroups.flatMap(g => g.items), [pageGroups]);
```

`useInput` for `select` scopes navigation and toggling to `pageItems`. `enter` either advances `kindPageIndex` or, on the last page, runs the existing terminal logic:

```ts
if (kindPageIndex < activeKinds.length - 1) {
  setKindPageIndex(i => i + 1);
} else {
  if (newSelected.length === 0 && allUninstallIds.length === 0) { onComplete({}); exit(); return; }
  setScreen(hasPlugin && repoRoot ? 'scope' : 'confirm');
}
```

### UI components

- **`KindPageBreadcrumb`** (new, `src/ui/KindPageBreadcrumb.tsx`) — pure component, props `{ kinds: ItemKind[], index: number }`. Renders e.g. `Tools (1/3)  ·  Plugins  ·  MCP`. Current entry is bold + colored; others dim. The `(i/N)` suffix appears on the current entry only.
- **`ItemList`** (existing) — receives a sub-catalog scoped to `pageGroups`. No internal change beyond accepting whatever subset is passed in (already does that — it iterates `catalog.groups`).
- The existing footer hint line gains `· ← back` when `kindPageIndex > 0`.

### Schema

`src/catalog/schema.ts` gains an optional field on the group schema:

```ts
page: z.enum(['tool', 'plugin', 'mcp']).optional(),
```

`src/types.ts` mirrors the type:

```ts
export interface CatalogGroup {
  …
  /** Optional override for which kind-page this group renders on. Defaults to dominantKind(items). */
  page?: ItemKind;
}
```

No catalog data migration is required. The existing `memory` group (mixed plugin + tool) can later set `page: 'plugin'` if we want it pinned, but that is a catalog change, not part of this work.

### Module layout

| File | Change |
|---|---|
| `src/types.ts` | Add `page?: ItemKind` to `CatalogGroup`. |
| `src/catalog/schema.ts` | Add optional `page` field. |
| `src/catalog/groups.ts` | Add `dominantKind`, `pageOf`, `activeKinds`. |
| `src/ui/App.tsx` | Replace single-cursor + single-page logic with `kindPageIndex` + `pageCursors`. |
| `src/ui/KindPageBreadcrumb.tsx` | New component. |
| `src/ui/ItemList.tsx` | Footer hint includes `← back` when applicable. No other change. |

## Testing

### Unit

- `tests/catalog/groups.test.ts`
  - `dominantKind` — pure groups, mixed groups, tiebreak (`tool > plugin > mcp`).
  - `pageOf` — explicit `page` override wins; falls back to `dominantKind`.
  - `activeKinds` — canonical order; omits kinds with zero assigned groups; suppresses `'mcp'` when `repoRoot === null`.
- `tests/catalog/schema.test.ts` — accepts optional `page`; rejects invalid values; tolerates absence (back-compat).
- `tests/ui/KindPageBreadcrumb.test.tsx` — renders only active kinds, marks current with `(i/N)`.

### Integration (ink-testing-library)

- Forward through all pages, selections persisted across page transitions.
- Back navigation (`←`) restores per-page cursor position.
- Empty-kind pages skipped (breadcrumb omits, never rendered).
- Pick-one across pages — fixture with a mixed-kind group pinned via `page` to one kind; selecting an item on its page still excludes the cross-page sibling in the final plan.
- Enter on the last page transitions to `scope` when `hasPlugin && repoRoot`, else `confirm`.
- Enter on the last page with no selections and no uninstalls calls `onComplete({})` and exits.

### E2E

No new e2e cases. Existing `tests/e2e/` flows continue to pass — paging is UI-internal and the install plan it produces is identical to the single-page version.

## Risks and mitigations

- **Cursor / page-index drift if `activeKinds` changes mid-session.** `activeKinds` depends on `displayCatalog` and `repoRoot`, both of which are stable for a session. Still, guard with `Math.min(kindPageIndex, activeKinds.length - 1)` on render to avoid out-of-bounds.
- **Cross-page pick-one confusion.** With group routing decided per-group (not per-item), a pick-one group is always on exactly one page, so the in-group toggle UX is preserved. Cross-page conflicts only arise from the existing `findConflicts` logic, which already runs once at the `'conflict'` screen before any select page.
- **Footer hint sprawl.** The footer line is already two lines; we are adding only `· ← back` to the first when applicable. No extra lines.

## Out of scope (future work)

- A `skill` kind and its corresponding page (the `pageOf` / `activeKinds` shape already accommodates a new kind without restructuring).
- Setting `page: 'plugin'` on the existing `memory` group (catalog change, separate PR).
- Per-page search / filter input.
