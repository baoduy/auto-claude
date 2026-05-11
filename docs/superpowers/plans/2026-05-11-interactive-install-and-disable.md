# Interactive Install + Disabled Items + Default Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every install/uninstall/post-install command run on the real TTY so interactive prompts work, add a `disabled` catalog flag that hides items and groups from every command surface, and remove the obsolete `auto-claude default` command and `default: true` flag.

**Architecture:** Ink owns the TTY for selection/scope/confirm only; once the user confirms, Ink unmounts and a new `stream-runner` module spawns each command with `stdio: 'inherit'` so the user sees raw output and answers prompts directly. Catalog loader runs items through a `filterDisabled` step after schema validation. The `default` command, `RunDefaultInstall`, `runDefaultList`, all `"default": true` flags, and the `interactive`/`DeferredInteractive`/`deferred` apparatus are deleted.

**Tech Stack:** TypeScript ESM, Ink 5 + React 18, Commander, Zod, execa, vitest + ink-testing-library.

**Spec:** `docs/superpowers/specs/2026-05-11-interactive-install-and-disable-design.md`

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/types.ts` | Add `disabled?: boolean` to `CatalogItem` (base) and `CatalogGroup`. Remove `default?: boolean` from `BaseCatalogItem`. Remove `DeferredInteractive` interface. Remove `interactive?: boolean` from `PostInstallAction`. |
| `src/catalog/schema.ts` | Add `disabled: z.boolean().optional()` to item base + group. Remove `default` field + `defaultCount` superRefine check. Remove `interactive` from `PostInstallActionSchema`. |
| `src/catalog/loader.ts` | After schema parse, call `filterDisabled(catalog)` to drop disabled items/groups. |
| `src/catalog/filter-disabled.ts` (NEW) | Pure function: returns a new catalog with disabled items and groups (and groups left empty) removed. |
| `src/engine/stream-runner.ts` (NEW) | `streamInstall(plan, opts)` and `streamSimple(commands, opts)`: spawn shell commands with `stdio: 'inherit'`, ask continue/abort on failure, buffer `claude-prompt` actions, print summary. |
| `src/engine/executor.ts` | Drop `deferred` parameter + `DeferredInteractive` handling + `action.interactive` branch. Keep event-based dry-run path for tests. |
| `src/commands/install.tsx` | After Ink confirm, unmount + call `streamInstall(plan)`. Delete the `deferred` collection block. |
| `src/commands/update.ts` | Replace inline execa loop with `streamSimple`. |
| `src/commands/remove.ts` | Replace inline execa loop with `streamSimple`. |
| `src/commands/default.ts` | Delete. |
| `src/cli.ts` | Drop the `default` subcommand and the imports for `runDefault` / `runDefaultList`. |
| `src/ui/App.tsx` | Run-screen handoff: after `confirm` press, exit Ink immediately rather than entering `'run'` screen. Remove `ProgressLog` + `PostInstallPanel` usage in `done` branch. |
| `src/ui/ProgressLog.tsx`, `src/ui/PostInstallPanel.tsx` | Delete (unused after handoff). |
| `catalog.json` | Strip every `"default": true` occurrence. |
| `tests/catalog/filter-disabled.test.ts` (NEW) | Verify drop semantics for disabled items, disabled groups, empty groups. |
| `tests/catalog/loader.test.ts` | Add a case asserting disabled items are filtered after load. |
| `tests/catalog/schema.test.ts` | Drop tests for the `default` flag. Add tests for `disabled` field acceptance. |
| `tests/catalog/catalog-json.test.ts` | Remove any default-flag assertions. |
| `tests/engine/stream-runner.test.ts` (NEW) | Mock execa; assert install order, abort on failure, `claude-prompt` buffering, summary lines. |
| `tests/engine/executor.test.ts`, `tests/engine/executor-mcp.test.ts` | Drop `deferred` arg + `interactive` action cases. |
| `tests/commands/default.test.ts` | Delete. |
| `tests/e2e/default.e2e.test.ts` | Delete. |
| `tests/e2e/install-dryrun.test.ts` | Update — dry-run flow unchanged but no `deferred`. |
| `tests/ui/App.test.tsx` | Replace the run-screen assertions with handoff-on-confirm assertions. |
| `tests/ui/panels.test.tsx` | Delete (panels gone). |
| `README.md` | Drop `default` rows from command table. Add `disabled` field doc + note that installs run in raw stdio with prompts. |

---

## Task 1: Add `disabled` flag to types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Read current types**

Read `src/types.ts:43-105` to confirm `BaseCatalogItem` and `CatalogGroup` shapes.

- [ ] **Step 2: Add `disabled` field**

Edit `src/types.ts`:

```ts
interface BaseCatalogItem {
  id: string;
  name: string;
  description: string;
  homepage?: string;
  /** When true, hidden from every command surface (wizard, status, update, remove). */
  disabled?: boolean;
}
```

And `CatalogGroup`:

```ts
export interface CatalogGroup {
  id: string;
  name: string;
  description?: string;
  kind: GroupKind;
  page?: ItemKind;
  /** When true, the whole group is hidden from every command surface. */
  disabled?: boolean;
  items: CatalogItem[];
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: passes (added optional fields, removed nothing yet).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add disabled flag to catalog item and group"
```

---

## Task 2: Add `disabled` to Zod schema

**Files:**
- Modify: `src/catalog/schema.ts`

- [ ] **Step 1: Write a failing schema test**

Add to `tests/catalog/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('disabled flag', () => {
  it('accepts disabled:true on item', () => {
    const cat = {
      version: 2,
      updatedAt: '2026-05-11',
      groups: [{
        id: 'g1', name: 'g1', kind: 'pick-many',
        items: [{
          id: 'a', name: 'a', description: '', kind: 'tool',
          defaultScope: 'global',
          detect: { command: 'a --v' },
          install: { command: 'true' },
          disabled: true,
        }],
      }],
    };
    expect(() => CatalogSchema.parse(cat)).not.toThrow();
  });

  it('accepts disabled:true on group', () => {
    const cat = {
      version: 2,
      updatedAt: '2026-05-11',
      groups: [{
        id: 'g1', name: 'g1', kind: 'pick-many', disabled: true,
        items: [{
          id: 'a', name: 'a', description: '', kind: 'tool',
          defaultScope: 'global',
          detect: { command: 'a --v' },
          install: { command: 'true' },
        }],
      }],
    };
    expect(() => CatalogSchema.parse(cat)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/catalog/schema.test.ts -t "disabled flag"`
Expected: FAIL with "Unrecognized key 'disabled'".

- [ ] **Step 3: Add `disabled` to schema**

Edit `src/catalog/schema.ts`:

```ts
const ShellItemBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  homepage: z.string().url().optional(),
  defaultScope: z.enum(['global', 'project']),
  detect: DetectSpecSchema,
  install: CommandSpecSchema,
  uninstall: CommandSpecSchema.optional(),
  update: CommandSpecSchema.optional(),
  postInstall: z.array(PostInstallActionSchema).optional(),
  disabled: z.boolean().optional(),
};
```

```ts
const McpItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  homepage: z.string().url().optional(),
  kind: z.literal('mcp'),
  mcpKey: z.string().min(1),
  mcpServer: McpServerSchema,
  postInstall: z.array(PostInstallActionSchema).optional(),
  disabled: z.boolean().optional(),
});
```

```ts
export const CatalogGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['pick-one', 'pick-many']),
  page: z.enum(['tool', 'plugin', 'mcp']).optional(),
  disabled: z.boolean().optional(),
  items: z.array(CatalogItemSchema).min(1),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/catalog/schema.test.ts -t "disabled flag"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/schema.ts tests/catalog/schema.test.ts
git commit -m "feat(schema): accept disabled flag on item and group"
```

---

## Task 3: Implement `filterDisabled` and wire it into the loader

**Files:**
- Create: `src/catalog/filter-disabled.ts`
- Modify: `src/catalog/loader.ts`
- Create: `tests/catalog/filter-disabled.test.ts`

- [ ] **Step 1: Write a failing test for filter-disabled**

Create `tests/catalog/filter-disabled.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterDisabled } from '../../src/catalog/filter-disabled.js';
import type { Catalog } from '../../src/types.js';

function mkItem(id: string, disabled = false) {
  return {
    id, name: id, description: '', kind: 'tool' as const,
    defaultScope: 'global' as const,
    detect: { command: 'true' },
    install: { command: 'true' },
    disabled: disabled || undefined,
  };
}

function mkCat(groups: Array<{ id: string; disabled?: boolean; items: ReturnType<typeof mkItem>[] }>): Catalog {
  return {
    version: 2,
    updatedAt: '2026-05-11',
    groups: groups.map((g) => ({
      id: g.id, name: g.id, kind: 'pick-many', items: g.items,
      ...(g.disabled ? { disabled: true } : {}),
    })),
  };
}

describe('filterDisabled', () => {
  it('drops disabled items', () => {
    const cat = mkCat([{ id: 'g1', items: [mkItem('a'), mkItem('b', true)] }]);
    const out = filterDisabled(cat);
    expect(out.groups[0].items.map((i) => i.id)).toEqual(['a']);
  });

  it('drops disabled groups', () => {
    const cat = mkCat([
      { id: 'g1', disabled: true, items: [mkItem('a')] },
      { id: 'g2', items: [mkItem('b')] },
    ]);
    const out = filterDisabled(cat);
    expect(out.groups.map((g) => g.id)).toEqual(['g2']);
  });

  it('drops groups left empty after item filter', () => {
    const cat = mkCat([
      { id: 'g1', items: [mkItem('a', true), mkItem('b', true)] },
      { id: 'g2', items: [mkItem('c')] },
    ]);
    const out = filterDisabled(cat);
    expect(out.groups.map((g) => g.id)).toEqual(['g2']);
  });

  it('keeps non-disabled items in a partially disabled group', () => {
    const cat = mkCat([{ id: 'g1', items: [mkItem('a'), mkItem('b', true), mkItem('c')] }]);
    const out = filterDisabled(cat);
    expect(out.groups[0].items.map((i) => i.id)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/catalog/filter-disabled.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create the implementation**

Create `src/catalog/filter-disabled.ts`:

```ts
import type { Catalog } from '../types.js';

/** Returns a new catalog with `disabled: true` items and groups removed.
 *  Groups left empty by item filtering are also dropped. */
export function filterDisabled(catalog: Catalog): Catalog {
  const groups = catalog.groups
    .filter((g) => g.disabled !== true)
    .map((g) => ({ ...g, items: g.items.filter((i) => i.disabled !== true) }))
    .filter((g) => g.items.length > 0);
  return { ...catalog, groups };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/catalog/filter-disabled.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into loader**

Edit `src/catalog/loader.ts`:

```ts
import { CatalogSchema } from './schema.js';
import type { Catalog } from '../types.js';
import { filterDisabled } from './filter-disabled.js';
// … existing imports
```

Replace `tryParse`:

```ts
function tryParse(json: string): Catalog | null {
  try {
    const obj = JSON.parse(json);
    return filterDisabled(CatalogSchema.parse(obj));
  } catch {
    return null;
  }
}
```

And the bundled fallback at the bottom of `loadCatalog`:

```ts
return filterDisabled(bundled);
```

- [ ] **Step 6: Add loader test for filtering**

Append to `tests/catalog/loader.test.ts`:

```ts
import { CatalogSchema } from '../../src/catalog/schema.js';

it('drops disabled items from loaded catalog', async () => {
  const tampered = JSON.parse(validJson);
  tampered.groups[0].items[0].disabled = true;
  const droppedId = tampered.groups[0].items[0].id;
  const tamperedJson = JSON.stringify(tampered);
  const cat = await loadCatalog(makeDeps({
    fetchUrl: async () => ({ ok: true, body: tamperedJson }),
  }));
  const all = cat.groups.flatMap((g) => g.items.map((i) => i.id));
  expect(all).not.toContain(droppedId);
});
```

- [ ] **Step 7: Run all catalog tests**

Run: `pnpm vitest run tests/catalog/`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/catalog/filter-disabled.ts src/catalog/loader.ts tests/catalog/filter-disabled.test.ts tests/catalog/loader.test.ts
git commit -m "feat(catalog): filter disabled items and groups after load"
```

---

## Task 4: Build `stream-runner` module

**Files:**
- Create: `src/engine/stream-runner.ts`
- Create: `tests/engine/stream-runner.test.ts`

- [ ] **Step 1: Define the public API**

Design notes:
- `streamInstall(plan: InstallPlan, opts: StreamOptions): Promise<StreamResult>` — runs uninstalls (Phase 1), installs + post-install (Phase 2), MCP config writes inline (no shell).
- `streamSimple(commands: StreamCommand[], opts: StreamOptions): Promise<StreamResult>` — used by `update` and `remove` commands.
- `StreamCommand`: `{ label: string; command: string; cwd?: string }`.
- `StreamResult`: `{ succeeded: string[]; failed: string[]; claudePrompts: Array<{ label: string; value: string }> }`.
- `StreamOptions`: `{ runShell: (cmd, opts) => Promise<{ exitCode: number }>; mcpInstall?: (item, plan) => Promise<void>; mcpUninstall?: (item, plan) => Promise<void>; onFailure?: (ctx) => Promise<'continue' | 'abort'>; write?: (s: string) => void }`.

The default `runShell` uses `execa(cmd, { stdio: 'inherit', shell: true, reject: false, cwd })`. The default `onFailure` uses `readline` to prompt `[c]ontinue / [a]bort? `.

- [ ] **Step 2: Write the failing test**

Create `tests/engine/stream-runner.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { streamInstall } from '../../src/engine/stream-runner.js';
import type { InstallPlan, CatalogItem } from '../../src/types.js';

function tool(id: string, postPrompt?: { label: string; value: string }): CatalogItem {
  return {
    id, name: id, description: '', kind: 'tool',
    defaultScope: 'global',
    detect: { command: 'true' },
    install: { command: `install ${id}` },
    uninstall: { command: `uninstall ${id}` },
    postInstall: postPrompt
      ? [{ type: 'claude-prompt', value: postPrompt.value, label: postPrompt.label }]
      : undefined,
  };
}

describe('streamInstall', () => {
  it('runs uninstalls then installs in order', async () => {
    const calls: string[] = [];
    const runShell = vi.fn(async (cmd: string) => { calls.push(cmd); return { exitCode: 0 }; });
    const plan: InstallPlan = {
      uninstall: [tool('a')],
      selected: [tool('b'), tool('c')],
      scope: 'global',
      repoRoot: null,
    };
    const result = await streamInstall(plan, { runShell, write: () => {} });
    expect(calls).toEqual(['uninstall a', 'install b', 'install c']);
    expect(result.succeeded).toEqual(['a', 'b', 'c']);
    expect(result.failed).toEqual([]);
  });

  it('buffers claude-prompt post-install actions', async () => {
    const plan: InstallPlan = {
      selected: [tool('b', { label: 'API key', value: 'set FOO=bar' })],
      scope: 'global', repoRoot: null,
    };
    const result = await streamInstall(plan, {
      runShell: async () => ({ exitCode: 0 }),
      write: () => {},
    });
    expect(result.claudePrompts).toEqual([{ label: 'API key', value: 'set FOO=bar' }]);
  });

  it('aborts on failure when onFailure returns abort', async () => {
    const runShell = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1 })
      .mockResolvedValueOnce({ exitCode: 0 });
    const plan: InstallPlan = {
      selected: [tool('b'), tool('c')],
      scope: 'global', repoRoot: null,
    };
    const onFailure = vi.fn(async () => 'abort' as const);
    const result = await streamInstall(plan, { runShell, onFailure, write: () => {} });
    expect(runShell).toHaveBeenCalledTimes(1);
    expect(result.failed).toEqual(['b']);
    expect(result.succeeded).toEqual([]);
  });

  it('continues past failure when onFailure returns continue', async () => {
    const runShell = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1 })
      .mockResolvedValueOnce({ exitCode: 0 });
    const plan: InstallPlan = {
      selected: [tool('b'), tool('c')],
      scope: 'global', repoRoot: null,
    };
    const onFailure = vi.fn(async () => 'continue' as const);
    const result = await streamInstall(plan, { runShell, onFailure, write: () => {} });
    expect(runShell).toHaveBeenCalledTimes(2);
    expect(result.failed).toEqual(['b']);
    expect(result.succeeded).toEqual(['c']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/engine/stream-runner.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Implement stream-runner**

Create `src/engine/stream-runner.ts`:

```ts
import { execa } from 'execa';
import { createInterface } from 'node:readline/promises';
import type { CatalogItem, InstallPlan, McpItem, PostInstallAction } from '../types.js';
import { isShellItem } from '../types.js';
import { orderForInstall, orderForUninstall } from './ordering.js';

export interface StreamCommand {
  itemId: string;
  itemName: string;
  label: string;
  command: string;
  cwd?: string;
}

export interface StreamOptions {
  runShell?: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number }>;
  onFailure?: (ctx: { itemId: string; label: string; exitCode: number }) => Promise<'continue' | 'abort'>;
  write?: (s: string) => void;
  mcpInstall?: (item: McpItem, plan: InstallPlan) => Promise<void>;
  mcpUninstall?: (item: McpItem, plan: InstallPlan) => Promise<void>;
}

export interface StreamResult {
  succeeded: string[];
  failed: string[];
  claudePrompts: Array<{ itemId: string; label: string; value: string }>;
}

const defaultRunShell: NonNullable<StreamOptions['runShell']> = async (cmd, opts) => {
  const r = await execa(cmd, { shell: true, reject: false, stdio: 'inherit', cwd: opts?.cwd });
  return { exitCode: r.exitCode ?? 1 };
};

const defaultOnFailure: NonNullable<StreamOptions['onFailure']> = async ({ label, exitCode }) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`\n✗ ${label} failed (exit ${exitCode}). [c]ontinue / [a]bort? `)).trim().toLowerCase();
    return ans.startsWith('c') ? 'continue' : 'abort';
  } finally {
    rl.close();
  }
};

function resolveCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (item.kind === 'mcp') return undefined;
  if (item.install.cwd === 'repo-root' && plan.repoRoot) return plan.repoRoot;
  if (item.kind === 'plugin' && plan.scope === 'project' && plan.repoRoot) return plan.repoRoot;
  return undefined;
}

export async function streamInstall(plan: InstallPlan, opts: StreamOptions = {}): Promise<StreamResult> {
  const runShell = opts.runShell ?? defaultRunShell;
  const onFailure = opts.onFailure ?? defaultOnFailure;
  const write = opts.write ?? ((s: string) => process.stdout.write(s));
  const result: StreamResult = { succeeded: [], failed: [], claudePrompts: [] };

  const uninstalls = orderForUninstall((plan.uninstall ?? []).filter((i) => i.kind === 'mcp' || (isShellItem(i) && i.uninstall)));
  const installs = orderForInstall(plan.selected);
  const total = uninstalls.length + installs.length;
  let step = 0;

  write(`\n▶ Running ${total} action${total === 1 ? '' : 's'}…\n`);

  for (const item of uninstalls) {
    step++;
    write(`\n── [${step}/${total}] Uninstall ${item.name} ──\n`);
    const ok = await runOne(item, 'uninstall');
    if (!ok) {
      const choice = await onFailure({ itemId: item.id, label: `Uninstall ${item.name}`, exitCode: 1 });
      result.failed.push(item.id);
      if (choice === 'abort') return summarize(result, write);
      continue;
    }
    result.succeeded.push(item.id);
  }

  for (const item of installs) {
    step++;
    write(`\n── [${step}/${total}] ${item.name} ──\n`);
    const ok = await runOne(item, 'install');
    if (!ok) {
      const choice = await onFailure({ itemId: item.id, label: item.name, exitCode: 1 });
      result.failed.push(item.id);
      if (choice === 'abort') return summarize(result, write);
      continue;
    }
    result.succeeded.push(item.id);
    for (const action of item.postInstall ?? []) {
      await runPostInstall(item, action, result, runShell, onFailure, write, plan);
    }
  }

  return summarize(result, write);

  async function runOne(item: CatalogItem, phase: 'install' | 'uninstall'): Promise<boolean> {
    if (item.kind === 'mcp') {
      try {
        if (phase === 'install' && opts.mcpInstall) await opts.mcpInstall(item, plan);
        if (phase === 'uninstall' && opts.mcpUninstall) await opts.mcpUninstall(item, plan);
        return true;
      } catch (err: any) {
        write(`✗ ${err?.message ?? err}\n`);
        return false;
      }
    }
    const cmd = phase === 'install' ? item.install.command : item.uninstall!.command;
    const cwd = resolveCwd(item, plan);
    const r = await runShell(cmd, cwd ? { cwd } : undefined);
    return r.exitCode === 0;
  }
}

async function runPostInstall(
  item: CatalogItem,
  action: PostInstallAction,
  result: StreamResult,
  runShell: NonNullable<StreamOptions['runShell']>,
  onFailure: NonNullable<StreamOptions['onFailure']>,
  write: (s: string) => void,
  plan: InstallPlan,
): Promise<void> {
  if (action.requiresRepo && !plan.repoRoot) return;
  if (action.type === 'claude-prompt') {
    result.claudePrompts.push({ itemId: item.id, label: action.label ?? '', value: action.value });
    return;
  }
  const label = action.label ?? action.value;
  write(`\n  → ${item.name}: ${label}\n`);
  const cwd = plan.repoRoot ?? undefined;
  const r = await runShell(action.value, cwd ? { cwd } : undefined);
  if (r.exitCode !== 0) {
    const choice = await onFailure({ itemId: item.id, label: `${item.name} post-install: ${label}`, exitCode: r.exitCode });
    if (choice === 'abort') throw new Error(`aborted at post-install for ${item.id}`);
  }
}

function summarize(result: StreamResult, write: (s: string) => void): StreamResult {
  write(`\n── Summary ──\n`);
  write(`  ok:     ${result.succeeded.length}\n`);
  write(`  failed: ${result.failed.length}${result.failed.length ? ` (${result.failed.join(', ')})` : ''}\n`);
  if (result.claudePrompts.length > 0) {
    write(`\n  Tell Claude (paste these into your session):\n`);
    for (const p of result.claudePrompts) {
      write(`    • ${p.label}: ${p.value}\n`);
    }
  }
  return result;
}

export async function streamSimple(commands: StreamCommand[], opts: StreamOptions = {}): Promise<StreamResult> {
  const runShell = opts.runShell ?? defaultRunShell;
  const onFailure = opts.onFailure ?? defaultOnFailure;
  const write = opts.write ?? ((s: string) => process.stdout.write(s));
  const result: StreamResult = { succeeded: [], failed: [], claudePrompts: [] };
  const total = commands.length;
  write(`\n▶ Running ${total} action${total === 1 ? '' : 's'}…\n`);
  let step = 0;
  for (const c of commands) {
    step++;
    write(`\n── [${step}/${total}] ${c.label} ──\n`);
    const r = await runShell(c.command, c.cwd ? { cwd: c.cwd } : undefined);
    if (r.exitCode === 0) {
      result.succeeded.push(c.itemId);
    } else {
      result.failed.push(c.itemId);
      const choice = await onFailure({ itemId: c.itemId, label: c.label, exitCode: r.exitCode });
      if (choice === 'abort') break;
    }
  }
  return summarize(result, write);
}
```

- [ ] **Step 5: Run stream-runner tests**

Run: `pnpm vitest run tests/engine/stream-runner.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/stream-runner.ts tests/engine/stream-runner.test.ts
git commit -m "feat(engine): add stream-runner with inherited stdio and continue/abort prompt"
```

---

## Task 5: Switch `install` command to stream-runner

**Files:**
- Modify: `src/commands/install.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Update `App.tsx` so confirm exits Ink instead of entering `'run'`**

Edit `src/ui/App.tsx`:

In the `useInput` handler, replace the `screen === 'confirm'` branch:

```tsx
} else if (screen === 'confirm') {
  if (key.return) {
    const plan: InstallPlan = {
      selected: newSelected.map((id) => items.find((i) => i.id === id)!),
      uninstall: allUninstallIds.map((id) => items.find((i) => i.id === id)!),
      scope,
      repoRoot,
    };
    onComplete({ plan });
    exit();
  }
}
```

Also remove the `'run'` and `'done'` screen handling at the bottom (`body = <ProgressLog … />` and the fallback `body =` block). Replace the trailing `useEffect` for done-screen handoff with nothing — handoff happens at confirm.

Update `Screen` type and `AppProps`:

```tsx
type Screen = 'conflict' | 'select' | 'scope' | 'confirm';

export interface AppProps {
  catalog: Catalog;
  initialStates: InstallState[];
  repoRoot: string | null;
  onComplete: (r: { aborted?: boolean; plan?: InstallPlan }) => void;
}
```

Delete the `runInstall` prop usage entirely. Delete `events`, `runError`, `useEffect` for done. Body switch now only has `conflict | select | scope | confirm` branches.

- [ ] **Step 2: Update `install.tsx` to use stream-runner**

Rewrite `src/commands/install.tsx`:

```tsx
import React from 'react';
import { render } from 'ink';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import { streamInstall } from '../engine/stream-runner.js';
import { executeInstall } from '../engine/executor.js';
import { App } from '../ui/App.js';
import { enterAltScreen, exitAltScreen } from '../ui/altScreen.js';
import { execa } from 'execa';
import type { InstallPlan } from '../types.js';
import { flattenItems } from '../catalog/groups.js';
import { readMcpConfig, addMcpServer, removeMcpServer, writeMcpConfig, hasMcpServer, mcpConfigPath } from '../engine/mcp-config.js';

async function applyMcpInstall(item: any, plan: InstallPlan): Promise<void> {
  const path = mcpConfigPath(plan.scope, plan.repoRoot);
  const cfg = await readMcpConfig(path);
  if (hasMcpServer(cfg, item.mcpKey)) return;
  await writeMcpConfig(path, addMcpServer(cfg, item.mcpKey, item.mcpServer));
}
async function applyMcpUninstall(item: any, plan: InstallPlan): Promise<void> {
  const path = mcpConfigPath(plan.scope, plan.repoRoot);
  const cfg = await readMcpConfig(path);
  if (!hasMcpServer(cfg, item.mcpKey)) return;
  await writeMcpConfig(path, removeMcpServer(cfg, item.mcpKey));
}

export async function runInstall(opts: { refreshCatalog?: boolean; dryRun?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const repoRoot = await findRepoRoot();
  const initialStates = await detectStates(flattenItems(catalog), undefined, repoRoot);

  let chosenPlan: InstallPlan | undefined;
  let aborted = false;

  enterAltScreen();
  try {
    await new Promise<void>((resolve) => {
      const app = render(
        <App
          catalog={catalog}
          initialStates={initialStates}
          repoRoot={repoRoot}
          onComplete={(r) => {
            if (r.aborted) aborted = true;
            chosenPlan = r.plan;
            app.unmount();
            resolve();
          }}
        />,
      );
    });
  } finally {
    exitAltScreen();
  }

  if (aborted || !chosenPlan) return;

  if (opts.dryRun) {
    const dryRunRecord: string[] = [];
    await executeInstall(chosenPlan, {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      onEvent: () => {},
      dryRun: true,
      record: (line) => dryRunRecord.push(line),
    });
    process.stdout.write('\n--- dry run: recorded actions ---\n');
    if (dryRunRecord.length === 0) process.stdout.write('  (no actions)\n');
    else for (const line of dryRunRecord) process.stdout.write(`  ${line}\n`);
    process.stdout.write('--- no changes were applied ---\n');
    return;
  }

  const result = await streamInstall(chosenPlan, {
    mcpInstall: applyMcpInstall,
    mcpUninstall: applyMcpUninstall,
  });
  if (result.failed.length > 0) process.exitCode = 1;
}
```

- [ ] **Step 3: Update App.test.tsx for the new shape**

Edit `tests/ui/App.test.tsx`: replace any assertions that look for `'run'` or `'done'` screens / `ProgressLog` rendering with assertions that `onComplete` is called with `{ plan }` when user presses enter at confirm. (Read existing file first; preserve structure of unrelated tests.)

If the existing tests assert on `runInstall` being called, replace them: render `<App … onComplete={spy} />`, drive through enter presses, assert `spy.mock.calls[0][0].plan` has the right `selected`/`uninstall`/`scope`.

- [ ] **Step 4: Run unit tests**

Run: `pnpm vitest run tests/ui/App.test.tsx tests/engine/stream-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (note: `default` and `interactive` still referenced elsewhere; expect ~5–10 errors limited to `executor.ts`, `commands/default.ts`, `cli.ts`, default test files — these are fixed in later tasks).

- [ ] **Step 6: Commit**

```bash
git add src/commands/install.tsx src/ui/App.tsx tests/ui/App.test.tsx
git commit -m "feat(install): stream installs on real TTY after Ink unmount"
```

---

## Task 6: Switch `update` and `remove` commands to stream-runner

**Files:**
- Modify: `src/commands/update.ts`
- Modify: `src/commands/remove.ts`

- [ ] **Step 1: Rewrite update.ts**

Edit `src/commands/update.ts`:

```ts
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import type { CatalogItem, InstallState } from '../types.js';
import { isShellItem } from '../types.js';
import { printHeader } from '../ui/Header.js';
import { flattenItems } from '../catalog/groups.js';
import { streamSimple, type StreamCommand } from '../engine/stream-runner.js';

export function planUpdate(items: CatalogItem[], states: InstallState[], only?: string): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items
    .filter((i) => installed.has(i.id) && isShellItem(i) && i.update)
    .filter((i) => !only || i.id === only);
}

export async function runUpdate(opts: { only?: string; dryRun?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const repoRoot = await findRepoRoot();
  const states = await detectStates(flattenItems(catalog), undefined, repoRoot);
  const targets = planUpdate(flattenItems(catalog), states, opts.only);
  process.stdout.write(printHeader('update'));
  if (targets.length === 0) { console.log('Nothing to update.'); return; }
  if (opts.dryRun) {
    console.log('--- dry run: would run ---');
    for (const t of targets) {
      if (!isShellItem(t)) continue;
      console.log(`  ${t.update!.command}`);
    }
    console.log('--- no changes were applied ---');
    return;
  }
  const cmds: StreamCommand[] = targets
    .filter(isShellItem)
    .map((t) => ({ itemId: t.id, itemName: t.name, label: `Update ${t.name}`, command: t.update!.command }));
  const result = await streamSimple(cmds);
  if (result.failed.length > 0) process.exitCode = 1;
}
```

- [ ] **Step 2: Rewrite remove.ts**

Edit `src/commands/remove.ts`:

```ts
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import type { CatalogItem, InstallState } from '../types.js';
import { isShellItem } from '../types.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';
import { flattenItems } from '../catalog/groups.js';
import { streamSimple, type StreamCommand } from '../engine/stream-runner.js';

export function planUninstall(items: CatalogItem[], states: InstallState[]): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items.filter((i) => installed.has(i.id) && isShellItem(i) && i.uninstall);
}

export async function runRemove(opts: { yes?: boolean; dryRun?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const repoRoot = await findRepoRoot();
  const states = await detectStates(flattenItems(catalog), undefined, repoRoot);
  const targets = planUninstall(flattenItems(catalog), states);
  process.stdout.write(printHeader('remove'));
  if (targets.length === 0) { console.log('Nothing to uninstall.'); return; }
  console.log(paint('The following items will be uninstalled:', 'brand'));
  for (const t of targets) {
    const kindGlyph = t.kind === 'tool' ? paint(GLYPHS.tool, 'tool') : paint(GLYPHS.plugin, 'plugin');
    console.log(`  ${paint(GLYPHS.remove, 'warn')} ${kindGlyph} ${t.name}`);
  }
  if (opts.dryRun) {
    console.log('\n--- dry run: would run ---');
    for (const t of targets) {
      if (!isShellItem(t)) continue;
      console.log(`  ${t.uninstall!.command}`);
    }
    console.log('--- no changes were applied ---');
    return;
  }
  if (!opts.yes) { console.log('\nRe-run with --yes to confirm.'); return; }
  const cmds: StreamCommand[] = targets
    .filter(isShellItem)
    .map((t) => ({ itemId: t.id, itemName: t.name, label: `Uninstall ${t.name}`, command: t.uninstall!.command }));
  const result = await streamSimple(cmds);
  if (result.failed.length > 0) process.exitCode = 1;
}
```

- [ ] **Step 3: Run update/remove tests**

Run: `pnpm vitest run tests/commands/update.test.ts tests/commands/remove.test.ts`
Expected: PASS (these tests stub `execa` via `vi.mock` and only assert plan outputs — should still pass; if they assert on console output verbatim, adjust the assertion to match streamSimple's "▶ Running" header).

- [ ] **Step 4: Commit**

```bash
git add src/commands/update.ts src/commands/remove.ts tests/commands/update.test.ts tests/commands/remove.test.ts
git commit -m "feat(update,remove): use stream-runner for interactive output"
```

---

## Task 7: Strip `interactive`/`deferred` from executor

**Files:**
- Modify: `src/engine/executor.ts`
- Modify: `src/types.ts`
- Modify: `tests/engine/executor.test.ts`
- Modify: `tests/engine/executor-mcp.test.ts`

- [ ] **Step 1: Remove `interactive` from `PostInstallAction` and delete `DeferredInteractive`**

Edit `src/types.ts`:

```ts
export interface PostInstallAction {
  type: 'shell' | 'claude-prompt';
  value: string;
  requiresRepo?: boolean;
  label?: string;
}
```

Delete the `DeferredInteractive` interface and the `post-shell-deferred` event variant from `EngineEvent`.

- [ ] **Step 2: Remove from schema**

Edit `src/catalog/schema.ts`:

```ts
const PostInstallActionSchema = z.object({
  type: z.enum(['shell', 'claude-prompt']),
  value: z.string().min(1),
  requiresRepo: z.boolean().optional(),
  label: z.string().optional(),
});
```

- [ ] **Step 3: Strip from executor**

Edit `src/engine/executor.ts`:

Remove the `DeferredInteractive` import and the `deferred?: DeferredInteractive[]` field on `ExecuteOptions`. In `runPostInstall`, delete the `if (action.interactive && opts.deferred && !opts.dryRun)` block — every shell post-install just runs through the normal `opts.run` path now. (The dry-run + event path is preserved for tests.)

- [ ] **Step 4: Remove `interactive: true` from catalog.json**

Edit `catalog.json`: drop the `"interactive": true` line from the Snip `snip setup` post-install entry. (Single occurrence — search the file.)

- [ ] **Step 5: Fix executor tests**

Edit `tests/engine/executor.test.ts` and `tests/engine/executor-mcp.test.ts`:
- Remove any `deferred: []` from `executeInstall` calls.
- Remove any test that exercises `action.interactive` (mark those as "now handled by stream-runner").

- [ ] **Step 6: Run executor tests**

Run: `pnpm vitest run tests/engine/executor.test.ts tests/engine/executor-mcp.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/catalog/schema.ts src/engine/executor.ts catalog.json tests/engine/executor.test.ts tests/engine/executor-mcp.test.ts
git commit -m "refactor: remove deferred-interactive path; stream-runner handles all interactivity"
```

---

## Task 8: Remove `default` command and `default: true` flag

**Files:**
- Delete: `src/commands/default.ts`
- Delete: `tests/commands/default.test.ts`
- Delete: `tests/e2e/default.e2e.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/types.ts`
- Modify: `src/catalog/schema.ts`
- Modify: `src/catalog/groups.ts` (if it references `default`)
- Modify: `catalog.json`
- Modify: `tests/catalog/catalog-json.test.ts`, `tests/catalog/schema.test.ts`, `tests/catalog/groups.test.ts`

- [ ] **Step 1: Remove `default` from `BaseCatalogItem`**

Edit `src/types.ts`: delete the `default?: boolean` field from `BaseCatalogItem`.

- [ ] **Step 2: Remove from Zod schema + drop `defaultCount` check**

Edit `src/catalog/schema.ts`:
- Delete `default: z.boolean().optional()` from `ShellItemBase` and `McpItemSchema`.
- In the `superRefine` block, delete the `defaultCount` variable, the `if (item.default) defaultCount++` line, and the `if (group.kind === 'pick-one' && defaultCount > 1) …` check.

- [ ] **Step 3: Remove references in groups helper**

Run: `pnpm grep -n "findDefaultConflicts\|default === true\|item\.default" src/`

Edit `src/catalog/groups.ts`: remove `findDefaultConflicts` export (only used by deleted `default.ts`). If `flattenItems`/other helpers also reference `default`, drop those references.

- [ ] **Step 4: Strip CLI subcommand**

Edit `src/cli.ts`:

```ts
import { Command } from 'commander';
import { runInstall } from './commands/install.js';
import { runStatus } from './commands/status.js';
import { runRemove } from './commands/remove.js';
import { runUpdate } from './commands/update.js';

const program = new Command();

program
  .name('auto-claude')
  .description('Curated installer for Claude Code tools and plugins')
  .version('0.1.0')
  .enablePositionalOptions()
  .option('--refresh-catalog', 'force re-fetch catalog, ignore cache')
  .option('--dry-run', 'preview actions without modifying the system')
  .action(async (opts) => {
    await runInstall({ refreshCatalog: !!opts.refreshCatalog, dryRun: !!opts.dryRun });
  });

program.command('status')
  .description('Show installed/missing state for each item')
  .option('--refresh-catalog', 'force re-fetch catalog')
  .action(async (opts) => { await runStatus({ refreshCatalog: !!opts.refreshCatalog }); });

program.command('remove')
  .description('Uninstall installed items')
  .option('--yes', 'skip confirmation')
  .option('--dry-run', 'print what would be uninstalled without running anything')
  .action(async (opts) => { await runRemove({ yes: !!opts.yes, dryRun: !!opts.dryRun }); });

program.command('update')
  .description('Update installed items')
  .option('--only <id>', 'update only the given item')
  .option('--dry-run', 'print what would be updated without running anything')
  .action(async (opts) => { await runUpdate({ only: opts.only, dryRun: !!opts.dryRun }); });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
```

- [ ] **Step 5: Delete `default.ts` + tests**

Run:
```bash
git rm src/commands/default.ts tests/commands/default.test.ts tests/e2e/default.e2e.test.ts
```

- [ ] **Step 6: Strip `"default": true` from catalog.json**

Edit `catalog.json`: remove every `"default": true,` line (run `pnpm grep -n '"default": true' catalog.json` first to count, then edit each).

- [ ] **Step 7: Fix remaining catalog tests**

- `tests/catalog/catalog-json.test.ts`: remove any assertion on `item.default` or default-uniqueness.
- `tests/catalog/schema.test.ts`: remove tests for the "at most one default per pick-one group" rule.
- `tests/catalog/groups.test.ts`: remove tests for `findDefaultConflicts`.

- [ ] **Step 8: Update default-conflict UI bits if any**

Run: `pnpm grep -rn "findDefaultConflicts\|\.default" src/ui src/commands tests/ui`

Remove any remaining references (e.g., `ConflictPrompt` may still call findDefaultConflicts? It does not — `ConflictPrompt` uses `pendingConflicts` from `findConflicts`, separate function. Verify and leave alone.)

- [ ] **Step 9: Run full test suite**

Run: `pnpm test`
Expected: PASS. Any residual failures point to leftover `default`/`interactive`/`deferred` refs; grep + fix.

- [ ] **Step 10: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no `default` or `DeferredInteractive` references left).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: remove default command and default flag (replaced by interactive wizard)"
```

---

## Task 9: Delete unused UI panels

**Files:**
- Delete: `src/ui/ProgressLog.tsx`, `src/ui/PostInstallPanel.tsx`
- Delete: `tests/ui/panels.test.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run: `pnpm grep -rn "ProgressLog\|PostInstallPanel" src/ tests/`
Expected: only the files about to be deleted plus possibly App.test.tsx — confirm and remove any remaining imports from App.test.tsx.

- [ ] **Step 2: Delete files**

```bash
git rm src/ui/ProgressLog.tsx src/ui/PostInstallPanel.tsx tests/ui/panels.test.tsx
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(ui): remove ProgressLog and PostInstallPanel (replaced by streamed stdout)"
```

---

## Task 10: README + docs update

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md` (only the `Commands` table row that mentions `default`)

- [ ] **Step 1: Edit README command table**

Open `README.md`. Find the install-catalog command table. Remove rows:
- `npx auto-claude default`
- `npx auto-claude default --list`

Remove any "Default items" section that lists `default: true` entries.

- [ ] **Step 2: Add `disabled` field doc**

Add to the catalog-author section:

```md
### Hiding items

Set `"disabled": true` on a catalog item to remove it from every command surface (wizard, status, update, remove). Set it on a group to hide the whole group. Empty groups left over after item filtering are also dropped.
```

- [ ] **Step 3: Note interactive install**

Add to the wizard-flow section:

```md
After you confirm, the wizard exits and each install/uninstall/post-install command runs in your real terminal with inherited stdio. You can answer any prompts (sudo password, "trust this marketplace?", API-key questions) directly. On failure, you'll be asked `[c]ontinue / [a]bort?`.
```

- [ ] **Step 4: Update CLAUDE.md commands table**

Edit `/Users/steven/helmor/workspaces/auto-claude/elara/CLAUDE.md`. Drop the two `default` rows from the Commands table.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: drop default command rows; document disabled flag and interactive install"
```

---

## Task 11: Final verification

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all PASS, no skips.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: `dist/cli.js` produced, no errors.

- [ ] **Step 4: Smoke test the wizard**

Run: `node dist/cli.js --refresh-catalog`
- Navigate the wizard.
- Pick one item with a known interactive install (e.g. enable `--dry-run` and confirm command stream prints correctly).
- Confirm Ink unmounts cleanly when enter pressed at confirm.

- [ ] **Step 5: Smoke test `status`**

Run: `node dist/cli.js status`
Expected: prints groups + items; no default-flagged items shown.

- [ ] **Step 6: Smoke test absent `default` subcommand**

Run: `node dist/cli.js default`
Expected: Commander error "unknown command 'default'".

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "chore: post-verification fixes"
```

---

## Self-Review Notes

Coverage map:

- Spec §1 (remove default) → Task 8.
- Spec §2 (stream interactive install) → Tasks 4, 5, 6, 7, 9.
- Spec §3 (disabled flag) → Tasks 1, 2, 3.
- Spec file-by-file impact table → all rows touched at least once across Tasks 1-11.

Type-consistency:

- `streamInstall` / `streamSimple` / `StreamResult` / `StreamCommand` / `StreamOptions` — names stable across Tasks 4-6.
- `filterDisabled` — stable across Tasks 3 and tests.
- `AppProps.onComplete` new shape `{ aborted?, plan? }` — Task 5 Steps 1-3 use the same shape.

Placeholders scrubbed; every code step contains literal code or a literal command.
