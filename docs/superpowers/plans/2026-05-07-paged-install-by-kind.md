# Paged Install Wizard by Item Kind — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the wizard's single `select` screen into a sequence of per-kind pages (tools → plugins → mcp) with forward/back navigation, so each page fits comfortably on screen.

**Architecture:** Selection state stays global in `App.tsx`; paging is purely a render filter. Each `CatalogGroup` is routed to one page via an optional `group.page` field with a `dominantKind()` fallback (ties broken `tool > plugin > mcp`). Empty pages are skipped. A new `KindPageBreadcrumb` shows progress.

**Tech Stack:** TypeScript ESM, Ink 5 + React 18, Zod, Vitest + ink-testing-library.

**Spec:** `docs/superpowers/specs/2026-05-07-paged-install-by-kind-design.md`.

---

## File Map

| File | Change |
|---|---|
| `src/types.ts` | Add `page?: ItemKind` to `CatalogGroup`. |
| `src/catalog/schema.ts` | Add optional `page` field on `CatalogGroupSchema`. |
| `src/catalog/groups.ts` | Add `dominantKind(group)`, `pageOf(group)`, `activeKinds(catalog, repoRoot)`, `groupsForKind(catalog, kind)`. |
| `src/ui/KindPageBreadcrumb.tsx` | **New.** Pure component rendering the kind progress strip. |
| `src/ui/ItemList.tsx` | Footer hint shows `← back` when not on the first page (controlled via prop). |
| `src/ui/App.tsx` | Replace single `cursor` + single-select-screen logic with `kindPageIndex` + `pageCursors`; render breadcrumb + filtered groups. |
| `tests/catalog/groups.test.ts` | Tests for `dominantKind`, `pageOf`, `activeKinds`. |
| `tests/catalog/schema.test.ts` | Cover optional `page` field. |
| `tests/ui/KindPageBreadcrumb.test.tsx` | **New.** Component tests. |
| `tests/ui/App.test.tsx` | Update existing assertions for new flow; add forward/back/skip tests. |

Order: types/schema first (Task 1) → routing helpers (Task 2) → breadcrumb (Task 3) → App.tsx wiring (Task 4) → ItemList footer (Task 5) → integration tests (Task 6) → final verification (Task 7).

---

## Task 1: Add optional `page` field to `CatalogGroup` type and schema

**Files:**
- Modify: `src/types.ts`
- Modify: `src/catalog/schema.ts`
- Modify: `tests/catalog/schema.test.ts`

- [ ] **Step 1: Locate `tests/catalog/schema.test.ts`**

Run: `ls tests/catalog/schema.test.ts`
Expected: file exists. If not, create it with the imports below.

- [ ] **Step 2: Write failing tests for the optional `page` field**

Append to `tests/catalog/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('CatalogGroup.page', () => {
  const baseGroup = {
    id: 'g1', name: 'G', kind: 'pick-many' as const,
    items: [{
      id: 'i1', name: 'I', description: '', kind: 'tool' as const,
      defaultScope: 'global' as const,
      detect: { command: 'true' }, install: { command: 'true' },
    }],
  };

  it('accepts groups without a page field (back-compat)', () => {
    const r = CatalogSchema.safeParse({ version: 2, updatedAt: '2026-05-07', groups: [baseGroup] });
    expect(r.success).toBe(true);
  });

  it('accepts a valid page override', () => {
    const r = CatalogSchema.safeParse({
      version: 2, updatedAt: '2026-05-07',
      groups: [{ ...baseGroup, page: 'plugin' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid page value', () => {
    const r = CatalogSchema.safeParse({
      version: 2, updatedAt: '2026-05-07',
      groups: [{ ...baseGroup, page: 'banana' }],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm vitest run tests/catalog/schema.test.ts`
Expected: the new `page` cases fail (schema doesn't accept `page` yet, "rejects invalid page" passes vacuously since unknown keys are stripped — keep it; it pins the contract).

- [ ] **Step 4: Add `page` to the `CatalogGroup` interface**

In `src/types.ts`, change the `CatalogGroup` interface to:

```ts
export interface CatalogGroup {
  id: string;
  name: string;
  description?: string;
  kind: GroupKind;
  /** Optional override for which kind-page this group renders on in the wizard.
   *  Defaults to the dominant kind among items (tool > plugin > mcp tiebreak). */
  page?: ItemKind;
  items: CatalogItem[];
}
```

- [ ] **Step 5: Add `page` to `CatalogGroupSchema`**

In `src/catalog/schema.ts`, change `CatalogGroupSchema` to:

```ts
export const CatalogGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['pick-one', 'pick-many']),
  page: z.enum(['tool', 'plugin', 'mcp']).optional(),
  items: z.array(CatalogItemSchema).min(1),
});
```

- [ ] **Step 6: Run schema tests to confirm they pass**

Run: `pnpm vitest run tests/catalog/schema.test.ts`
Expected: all pass.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/catalog/schema.ts tests/catalog/schema.test.ts
git commit -m "feat(catalog): add optional CatalogGroup.page field for wizard kind-page routing"
```

---

## Task 2: Implement `dominantKind`, `pageOf`, `activeKinds`, `groupsForKind`

**Files:**
- Modify: `src/catalog/groups.ts`
- Create: `tests/catalog/groups.test.ts` (if missing) or modify if present

- [ ] **Step 1: Check whether `tests/catalog/groups.test.ts` exists**

Run: `ls tests/catalog/groups.test.ts`
If missing, create it in Step 2 with the full file content. If present, append the new `describe` blocks below.

- [ ] **Step 2: Write failing tests for the routing helpers**

Create or append to `tests/catalog/groups.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  dominantKind, pageOf, activeKinds, groupsForKind,
} from '../../src/catalog/groups.js';
import type { Catalog, CatalogGroup, CatalogItem } from '../../src/types.js';

const tool = (id: string): CatalogItem => ({
  id, name: id, description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'true' }, install: { command: 'true' },
});
const plugin = (id: string): CatalogItem => ({
  id, name: id, description: '', kind: 'plugin', defaultScope: 'global',
  detect: { command: 'true' }, install: { command: 'true' },
});
const mcp = (id: string): CatalogItem => ({
  id, name: id, description: '', kind: 'mcp',
  mcpKey: id, mcpServer: { command: 'x' },
});
const group = (id: string, items: CatalogItem[], extras: Partial<CatalogGroup> = {}): CatalogGroup => ({
  id, name: id, kind: 'pick-many', items, ...extras,
});

describe('dominantKind', () => {
  it('returns the only kind when group is pure', () => {
    expect(dominantKind(group('g', [tool('a'), tool('b')]))).toBe('tool');
  });
  it('returns the majority kind for mixed groups', () => {
    expect(dominantKind(group('g', [plugin('a'), plugin('b'), tool('c')]))).toBe('plugin');
  });
  it('breaks ties tool > plugin > mcp', () => {
    expect(dominantKind(group('g', [plugin('a'), tool('b')]))).toBe('tool');
    expect(dominantKind(group('g', [plugin('a'), mcp('b')]))).toBe('plugin');
    expect(dominantKind(group('g', [tool('a'), mcp('b')]))).toBe('tool');
  });
});

describe('pageOf', () => {
  it('returns explicit page when set', () => {
    const g = group('g', [tool('a')], { page: 'plugin' });
    expect(pageOf(g)).toBe('plugin');
  });
  it('falls back to dominantKind when page is unset', () => {
    expect(pageOf(group('g', [plugin('a'), tool('b')]))).toBe('tool');
  });
});

describe('activeKinds', () => {
  const cat = (groups: CatalogGroup[]): Catalog => ({ version: 2, updatedAt: '2026-05-07', groups });

  it('returns kinds in canonical order tool > plugin > mcp', () => {
    const c = cat([
      group('p', [plugin('p1')]),
      group('m', [mcp('m1')]),
      group('t', [tool('t1')]),
    ]);
    expect(activeKinds(c, '/repo')).toEqual(['tool', 'plugin', 'mcp']);
  });

  it('omits kinds with no assigned groups', () => {
    const c = cat([group('p', [plugin('p1')])]);
    expect(activeKinds(c, '/repo')).toEqual(['plugin']);
  });

  it('drops mcp when repoRoot is null', () => {
    const c = cat([group('m', [mcp('m1')]), group('t', [tool('t1')])]);
    expect(activeKinds(c, null)).toEqual(['tool']);
  });

  it('respects explicit page overrides', () => {
    const c = cat([
      group('mixed', [plugin('a'), tool('b')], { page: 'plugin' }),
    ]);
    expect(activeKinds(c, '/repo')).toEqual(['plugin']);
  });
});

describe('groupsForKind', () => {
  it('returns only groups whose page resolves to the requested kind', () => {
    const c: Catalog = {
      version: 2, updatedAt: '2026-05-07',
      groups: [
        group('g1', [tool('a')]),
        group('g2', [plugin('b')]),
        group('g3', [tool('c'), plugin('d')], { page: 'plugin' }),
      ],
    };
    expect(groupsForKind(c, 'tool').map(g => g.id)).toEqual(['g1']);
    expect(groupsForKind(c, 'plugin').map(g => g.id)).toEqual(['g2', 'g3']);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `pnpm vitest run tests/catalog/groups.test.ts`
Expected: fails — `dominantKind`, `pageOf`, `activeKinds`, `groupsForKind` not exported.

- [ ] **Step 4: Implement the helpers**

Replace `src/catalog/groups.ts` with:

```ts
import type { Catalog, CatalogGroup, CatalogItem, ItemKind } from '../types.js';

export function flattenItems(catalog: Catalog): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const g of catalog.groups) {
    for (const it of g.items) out.push(it);
  }
  return out;
}

export function groupByItemId(catalog: Catalog): Map<string, CatalogGroup> {
  const m = new Map<string, CatalogGroup>();
  for (const g of catalog.groups) {
    for (const it of g.items) m.set(it.id, g);
  }
  return m;
}

const KIND_ORDER: readonly ItemKind[] = ['tool', 'plugin', 'mcp'] as const;

export function dominantKind(group: CatalogGroup): ItemKind {
  const counts: Record<ItemKind, number> = { tool: 0, plugin: 0, mcp: 0 };
  for (const it of group.items) counts[it.kind]++;
  let best: ItemKind = KIND_ORDER[0]!;
  let bestCount = -1;
  for (const k of KIND_ORDER) {
    if (counts[k] > bestCount) {
      best = k;
      bestCount = counts[k];
    }
  }
  return best;
}

export function pageOf(group: CatalogGroup): ItemKind {
  return group.page ?? dominantKind(group);
}

/** Kinds that have at least one assigned group, in canonical order.
 *  Excludes 'mcp' when no repo is detected (matches displayCatalog filtering). */
export function activeKinds(catalog: Catalog, repoRoot: string | null): ItemKind[] {
  const out: ItemKind[] = [];
  for (const k of KIND_ORDER) {
    if (k === 'mcp' && !repoRoot) continue;
    if (catalog.groups.some((g) => pageOf(g) === k)) out.push(k);
  }
  return out;
}

export function groupsForKind(catalog: Catalog, kind: ItemKind): CatalogGroup[] {
  return catalog.groups.filter((g) => pageOf(g) === kind);
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `pnpm vitest run tests/catalog/groups.test.ts`
Expected: all pass.

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/catalog/groups.ts tests/catalog/groups.test.ts
git commit -m "feat(catalog): add dominantKind/pageOf/activeKinds/groupsForKind helpers"
```

---

## Task 3: Add `KindPageBreadcrumb` component

**Files:**
- Create: `src/ui/KindPageBreadcrumb.tsx`
- Create: `tests/ui/KindPageBreadcrumb.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `tests/ui/KindPageBreadcrumb.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { KindPageBreadcrumb } from '../../src/ui/KindPageBreadcrumb.js';

describe('<KindPageBreadcrumb>', () => {
  it('renders all active kinds with current marked (i/N)', () => {
    const { lastFrame } = render(
      <KindPageBreadcrumb kinds={['tool', 'plugin', 'mcp']} index={1} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/Tools/);
    expect(frame).toMatch(/Plugins\s*\(2\/3\)/);
    expect(frame).toMatch(/MCP/);
  });

  it('shows (1/2) on a two-kind flow', () => {
    const { lastFrame } = render(
      <KindPageBreadcrumb kinds={['tool', 'plugin']} index={0} />
    );
    expect(lastFrame() ?? '').toMatch(/Tools\s*\(1\/2\)/);
  });

  it('omits kinds that are not in the active list', () => {
    const { lastFrame } = render(
      <KindPageBreadcrumb kinds={['plugin']} index={0} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/Tools/);
    expect(frame).not.toMatch(/MCP/);
    expect(frame).toMatch(/Plugins\s*\(1\/1\)/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm vitest run tests/ui/KindPageBreadcrumb.test.tsx`
Expected: fails (file/component not found).

- [ ] **Step 3: Implement the component**

Create `src/ui/KindPageBreadcrumb.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ItemKind } from '../types.js';
import { COLORS } from './theme.js';

const LABELS: Record<ItemKind, string> = {
  tool: 'Tools',
  plugin: 'Plugins',
  mcp: 'MCP',
};

export interface KindPageBreadcrumbProps {
  kinds: ItemKind[];
  index: number;
}

export function KindPageBreadcrumb({ kinds, index }: KindPageBreadcrumbProps): React.JSX.Element {
  const total = kinds.length;
  return (
    <Box flexDirection="row">
      {kinds.map((k, i) => {
        const isCurrent = i === index;
        const label = LABELS[k];
        const suffix = isCurrent ? ` (${i + 1}/${total})` : '';
        const sep = i < kinds.length - 1 ? '  ·  ' : '';
        return (
          <Text key={k}>
            <Text bold={isCurrent} color={isCurrent ? COLORS.cursor : undefined} dimColor={!isCurrent}>
              {label}{suffix}
            </Text>
            <Text dimColor>{sep}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm vitest run tests/ui/KindPageBreadcrumb.test.tsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/KindPageBreadcrumb.tsx tests/ui/KindPageBreadcrumb.test.tsx
git commit -m "feat(ui): add KindPageBreadcrumb component"
```

---

## Task 4: Wire kind-paging into `App.tsx`

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/ItemList.tsx`

This task changes the `select` screen behavior. Existing `App.test.tsx` cases will need updating in Task 6 — it is expected that some App tests fail at the end of this task; we keep them failing until Task 6 fixes them.

- [ ] **Step 1: Add a `showBack` prop to `ItemList`**

In `src/ui/ItemList.tsx`, change the props interface and footer rendering:

```ts
export interface ItemListProps {
  catalog: Catalog;
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
  showBack?: boolean;
}
```

```ts
export function ItemList({ catalog, states, selected, cursor, showBack = false }: ItemListProps): React.JSX.Element {
```

Replace the navigate-hint footer line with:

```tsx
<Text dimColor>
  {GLYPHS.cursor} navigate ↑↓ · space toggle · enter continue{showBack ? ' · ← back' : ''} · q quit
</Text>
```

- [ ] **Step 2: Run typecheck to verify ItemList still compiles**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Update `App.tsx` imports and add helpers**

At the top of `src/ui/App.tsx`, replace the current `import { flattenItems, groupByItemId } from '../catalog/groups.js';` with:

```ts
import { flattenItems, groupByItemId, activeKinds as computeActiveKinds, groupsForKind } from '../catalog/groups.js';
import { KindPageBreadcrumb } from './KindPageBreadcrumb.js';
```

- [ ] **Step 4: Replace single `cursor` state with paged state**

In `App.tsx`, locate:

```ts
const [selected, setSelected] = useState<Set<string>>(new Set(installedIds));
const [cursor, setCursor] = useState(0);
const [screen, setScreen] = useState<Screen>(initialConflicts.length > 0 ? 'conflict' : 'select');
```

Replace with:

```ts
const activeKinds = useMemo(
  () => computeActiveKinds(displayCatalog, repoRoot),
  [displayCatalog, repoRoot],
);

const [selected, setSelected] = useState<Set<string>>(new Set(installedIds));
const [kindPageIndex, setKindPageIndex] = useState(0);
const [pageCursors, setPageCursors] = useState<number[]>(() => activeKinds.map(() => 0));
const [screen, setScreen] = useState<Screen>(initialConflicts.length > 0 ? 'conflict' : 'select');

// Guard against activeKinds shrinking mid-session.
const safePageIndex = Math.min(kindPageIndex, Math.max(0, activeKinds.length - 1));
const currentKind = activeKinds[safePageIndex];

const pageGroups = useMemo(
  () => (currentKind ? groupsForKind(displayCatalog, currentKind) : []),
  [displayCatalog, currentKind],
);
const pageItems = useMemo(
  () => pageGroups.flatMap((g) => g.items),
  [pageGroups],
);
const cursor = Math.min(pageCursors[safePageIndex] ?? 0, Math.max(0, pageItems.length - 1));

const setCursorForCurrentPage = (next: number | ((c: number) => number)) => {
  setPageCursors((arr) => {
    const out = arr.slice();
    const cur = out[safePageIndex] ?? 0;
    const value = typeof next === 'function' ? (next as (c: number) => number)(cur) : next;
    out[safePageIndex] = value;
    return out;
  });
};
```

- [ ] **Step 5: Update the `select` branch of `useInput`**

Locate the `if (screen === 'select') { ... }` block. Replace its body with:

```ts
if (key.upArrow) setCursorForCurrentPage((c) => Math.max(0, c - 1));
else if (key.downArrow) setCursorForCurrentPage((c) => Math.min(pageItems.length - 1, c + 1));
else if (key.leftArrow || input === 'b') {
  if (safePageIndex > 0) setKindPageIndex(safePageIndex - 1);
} else if (input === ' ') {
  const it = pageItems[cursor];
  if (!it) return;
  if (effectiveInstalled.has(it.id) && !(isShellItem(it) && it.uninstall)) return;
  const group = groupOf.get(it.id);
  setSelected((s) => {
    const next = new Set(s);
    if (group?.kind === 'pick-one') {
      if (next.has(it.id)) {
        next.delete(it.id);
      } else {
        for (const sib of group.items) next.delete(sib.id);
        next.add(it.id);
      }
    } else {
      if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
    }
    return next;
  });
} else if (key.return) {
  if (safePageIndex < activeKinds.length - 1) {
    setKindPageIndex(safePageIndex + 1);
    return;
  }
  // Last page — same terminal behavior as before.
  if (newSelected.length === 0 && allUninstallIds.length === 0) { onComplete({}); exit(); return; }
  if (hasPlugin && repoRoot) setScreen('scope');
  else setScreen('confirm');
}
```

- [ ] **Step 6: Render breadcrumb + filtered groups in the select branch**

Locate the existing select-branch render:

```tsx
} else if (screen === 'select') {
  const adjustedStates: InstallState[] = initialStates.map((s) =>
    effectiveInstalled.has(s.itemId) ? s : { ...s, installed: false }
  );
  body = (
    <Box flexDirection="column">
      {!repoRoot && hasMcpItems && (
        <Text dimColor>MCP items require a project (no repo detected).</Text>
      )}
      <ItemList catalog={displayCatalog} states={adjustedStates} selected={selected} cursor={cursor} />
    </Box>
  );
}
```

Replace with:

```tsx
} else if (screen === 'select') {
  const adjustedStates: InstallState[] = initialStates.map((s) =>
    effectiveInstalled.has(s.itemId) ? s : { ...s, installed: false }
  );
  const pageCatalog = { ...displayCatalog, groups: pageGroups };
  body = (
    <Box flexDirection="column">
      <KindPageBreadcrumb kinds={activeKinds} index={safePageIndex} />
      {!repoRoot && hasMcpItems && safePageIndex === 0 && (
        <Text dimColor>MCP items require a project (no repo detected).</Text>
      )}
      <ItemList
        catalog={pageCatalog}
        states={adjustedStates}
        selected={selected}
        cursor={cursor}
        showBack={safePageIndex > 0}
      />
    </Box>
  );
}
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Run the full test suite (some App tests will fail — that is expected)**

Run: `pnpm vitest run`
Expected: `tests/catalog/*` and `tests/ui/KindPageBreadcrumb.test.tsx` pass; some `tests/ui/App.test.tsx` cases may fail because they assumed the single-page flow. That is expected and addressed in Task 6.

- [ ] **Step 9: Commit**

```bash
git add src/ui/App.tsx src/ui/ItemList.tsx
git commit -m "feat(ui): page install wizard by item kind with forward/back nav"
```

---

## Task 5: Manual smoke test in dev mode

**Files:** none.

This task verifies the wizard renders and navigates correctly in a real terminal before we touch the integration tests.

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: success, `dist/cli.js` exists.

- [ ] **Step 2: Launch the wizard**

Run: `node dist/cli.js`
Expected:
- Header renders.
- Breadcrumb shows e.g. `Tools (1/3)  ·  Plugins  ·  MCP` (or `Tools (1/2) · Plugins` if you launched outside a repo so MCP is suppressed).
- Only tool-page groups are visible on screen 1.

- [ ] **Step 3: Navigate**

Press `↓` a few times, then `enter`. Expected: page advances to Plugins, breadcrumb updates to show `(2/N)` on Plugins. Press `←`. Expected: returns to Tools, cursor restored to where it was.

- [ ] **Step 4: Quit without changes**

Press `q`. Expected: clean exit with no install plan.

- [ ] **Step 5: Commit (no-op)**

No file changes; skip commit. Move to Task 6.

---

## Task 6: Update + extend `App.tsx` integration tests

**Files:**
- Modify: `tests/ui/App.test.tsx`

- [ ] **Step 1: Read the current test file end-to-end**

Run: `cat tests/ui/App.test.tsx`
Expected: review the existing assertions to know which ones must change.

- [ ] **Step 2: Update the "scope prompt" test to advance through pages first**

Find the test `'selecting an item, then enter, advances to scope prompt when plugin selected'`. The bundled catalog's first kind page is **tools** (memory group ties → tool). Replace the test body with one that walks through all kind pages and lands on scope. Use this fixture-based test instead of relying on the bundled catalog's row order:

```tsx
it('walks all kind pages and advances to scope when a plugin is selected', async () => {
  const onComplete = vi.fn();
  const fixture: Catalog = {
    version: 2, updatedAt: '2026-05-07',
    groups: [
      { id: 'g-tool', name: 'Tools', kind: 'pick-many', items: [
        { id: 't1', name: 't1', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ]},
      { id: 'g-plugin', name: 'Plugins', kind: 'pick-many', items: [
        { id: 'p1', name: 'p1', description: '', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ]},
    ],
  };
  const fState: InstallState[] = [
    { itemId: 't1', installed: false },
    { itemId: 'p1', installed: false },
  ];
  const { stdin, lastFrame } = render(
    <App catalog={fixture} initialStates={fState} repoRoot={'/repo'}
         runInstall={async () => {}} onComplete={onComplete} />
  );
  await new Promise((r) => setTimeout(r, 10));
  // Tools page: don't toggle, just advance.
  stdin.write('\r');
  await new Promise((r) => setTimeout(r, 10));
  // Plugins page: toggle p1, then advance.
  stdin.write(' ');
  await new Promise((r) => setTimeout(r, 10));
  stdin.write('\r');
  await new Promise((r) => setTimeout(r, 10));
  expect(lastFrame()).toContain('How should plugins be installed?');
}, 15000);
```

- [ ] **Step 3: Update the "starts on selection screen" test for the new breadcrumb**

Find the test `'starts on the selection screen and exits on q'`. Replace the assertion `expect(lastFrame()).toContain('Memory backend');` with assertions that match the breadcrumb + first page content:

```tsx
expect(lastFrame()).toMatch(/Tools\s*\(1\//);
expect(lastFrame()).toMatch(/claude|auto-claude/i);
```

(The breadcrumb appears on page 1 regardless of repoRoot. We no longer assert "Memory backend" because that group's name is now grouped under the tools page heading and other tests cover routing explicitly.)

- [ ] **Step 4: Add a "back navigation restores cursor" test**

Append:

```tsx
it('back navigation returns to the previous kind page', async () => {
  const onComplete = vi.fn();
  const fixture: Catalog = {
    version: 2, updatedAt: '2026-05-07',
    groups: [
      { id: 'g-tool', name: 'Tools', kind: 'pick-many', items: [
        { id: 't1', name: 't1', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ]},
      { id: 'g-plugin', name: 'Plugins', kind: 'pick-many', items: [
        { id: 'p1', name: 'p1', description: '', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ]},
    ],
  };
  const { stdin, lastFrame } = render(
    <App catalog={fixture}
         initialStates={[{ itemId: 't1', installed: false }, { itemId: 'p1', installed: false }]}
         repoRoot={'/repo'} runInstall={async () => {}} onComplete={onComplete} />
  );
  await new Promise((r) => setTimeout(r, 10));
  expect(lastFrame()).toMatch(/Tools\s*\(1\/2\)/);
  stdin.write('\r'); // advance to plugins
  await new Promise((r) => setTimeout(r, 10));
  expect(lastFrame()).toMatch(/Plugins\s*\(2\/2\)/);
  stdin.write('[D'); // ESC [ D = left arrow
  await new Promise((r) => setTimeout(r, 10));
  expect(lastFrame()).toMatch(/Tools\s*\(1\/2\)/);
});
```

- [ ] **Step 5: Add an "empty pages skipped" test**

Append:

```tsx
it('skips empty kind pages — no tools means breadcrumb starts at plugins', async () => {
  const fixture: Catalog = {
    version: 2, updatedAt: '2026-05-07',
    groups: [
      { id: 'g-plugin', name: 'Plugins', kind: 'pick-many', items: [
        { id: 'p1', name: 'p1', description: '', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ]},
    ],
  };
  const { lastFrame } = render(
    <App catalog={fixture}
         initialStates={[{ itemId: 'p1', installed: false }]}
         repoRoot={'/repo'} runInstall={async () => {}} onComplete={() => {}} />
  );
  await new Promise((r) => setTimeout(r, 10));
  const frame = lastFrame() ?? '';
  expect(frame).toMatch(/Plugins\s*\(1\/1\)/);
  expect(frame).not.toMatch(/Tools/);
  expect(frame).not.toMatch(/MCP/);
});
```

- [ ] **Step 6: Add a "cross-kind pick-one survives paging" test**

Append:

```tsx
it('a mixed-kind pick-one group is rendered on its assigned page and still mutually-excludes siblings', async () => {
  let received: InstallPlan | null = null;
  const fixture: Catalog = {
    version: 2, updatedAt: '2026-05-07',
    groups: [
      { id: 'mem', name: 'Memory', kind: 'pick-one', page: 'plugin', items: [
        { id: 'm-plugin', name: 'm-plugin', description: '', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
        { id: 'm-tool', name: 'm-tool', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ]},
    ],
  };
  const { stdin } = render(
    <App catalog={fixture}
         initialStates={[{ itemId: 'm-plugin', installed: false }, { itemId: 'm-tool', installed: false }]}
         repoRoot={'/repo'}
         runInstall={async (plan) => { received = plan; }}
         onComplete={() => {}} />
  );
  await new Promise((r) => setTimeout(r, 10));
  // Single page = plugin. Toggle first item (m-plugin), then ↓ + space (m-tool) to flip the pick-one.
  stdin.write(' ');
  await new Promise((r) => setTimeout(r, 10));
  stdin.write('[B'); // down
  stdin.write(' ');
  await new Promise((r) => setTimeout(r, 10));
  stdin.write('\r'); // enter — last page, advance to scope (plugin selected)
  await new Promise((r) => setTimeout(r, 10));
  // We need to choose scope and confirm to get runInstall called. Press enter on global, then enter on confirm.
  stdin.write('\r'); // scope = global
  await new Promise((r) => setTimeout(r, 10));
  stdin.write('\r'); // confirm
  await new Promise((r) => setTimeout(r, 50));
  expect(received).not.toBeNull();
  const ids = (received as unknown as InstallPlan).selected.map((i) => i.id);
  expect(ids).toContain('m-tool');
  expect(ids).not.toContain('m-plugin');
});
```

- [ ] **Step 7: Run the full test suite**

Run: `pnpm vitest run`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add tests/ui/App.test.tsx
git commit -m "test(ui): cover paged install wizard flow (forward/back/skip/cross-kind pick-one)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all green, including existing e2e tests.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: clean build, `dist/` updated.

- [ ] **Step 4: Smoke-test the binary**

Run: `node dist/cli.js status`
Expected: status output renders without errors (status command doesn't use the wizard but exercises the catalog loader and types — confirms no import-time regressions).

Run: `node dist/cli.js`
Expected: wizard launches, breadcrumb visible, paging works as smoke-tested in Task 5.

- [ ] **Step 5: Commit if dist/ is tracked**

Run: `git status`
If `dist/` is untracked (it should be — `dist/` is build output), no commit needed. Otherwise:

```bash
git add dist/
git commit -m "chore: rebuild dist after paged-install wizard"
```

---

## Self-Review Checklist (run before handing off)

- **Spec coverage:** §1 wizard flow → Task 4. §2 group→page assignment → Task 2. §3 per-page state → Task 4. §4 breadcrumb → Task 3. §5 testing → Tasks 1, 2, 3, 6. Schema additions → Task 1.
- **Placeholder scan:** none.
- **Type/method consistency:** `dominantKind`, `pageOf`, `activeKinds`, `groupsForKind` defined in Task 2 and used by Task 4 unchanged. `KindPageBreadcrumb` props (`kinds`, `index`) match between Task 3 and Task 4. `ItemList`'s new `showBack` prop is defined in Task 4 Step 1 and used in Task 4 Step 6.
