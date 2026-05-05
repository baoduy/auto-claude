# auto-claude `default` Subcommand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-interactive `auto-claude default` subcommand that silently installs every catalog item flagged `default: true` to the global scope (suitable for fleet bash automation), plus `auto-claude default --list` to inspect the default set. Also consolidate `src/catalog/bundled.json` into a single root-level `catalog.json`.

**Architecture:** New `src/commands/default.ts` consumes the existing engine (`detect.ts`, `executor.ts`, `ordering.ts`) without mounting Ink. It runs detection first, skips already-installed items, then drives the executor item-by-item (catching per-item failures so the loop continues). Plugin scope is hardcoded `global`, post-install Claude prompts are suppressed with a notice, and exit code is `0` on success / `1` on partial failure / `2` on catalog load failure.

**Tech Stack:** TypeScript (ESM), Commander, Zod, vitest. Existing engine + loader unchanged.

**Spec:** `docs/superpowers/specs/2026-05-05-auto-claude-default-design.md`

---

## File Structure

| File | Role |
|---|---|
| `catalog.json` (NEW, repo root) | Single source of truth for the catalog. Replaces `src/catalog/bundled.json`. |
| `src/catalog/bundled.json` | DELETED. |
| `src/catalog/loader.ts` | Updated to import `../../catalog.json`. |
| `src/catalog/schema.ts` | Adds optional `default: boolean` to `CatalogItemSchema`. |
| `src/types.ts` | Adds optional `default?: boolean` to `CatalogItem`. |
| `package.json` | `files` field changed: `src/catalog/bundled.json` → `catalog.json`. |
| `src/commands/default.ts` (NEW) | `runDefault` and `runDefaultList`. |
| `src/cli.ts` | Wires the `default` subcommand and `--list` flag. |
| `tests/catalog/bundled.test.ts` | Renamed `tests/catalog/catalog-json.test.ts`, paths updated. |
| `tests/catalog/schema.test.ts` | Adds cases for `default` field. |
| `tests/commands/default.test.ts` (NEW) | Behavior tests for both functions. |
| `tests/e2e/default.e2e.test.ts` (NEW) | Invokes `dist/cli.js default --list` against fixture. |

---

## Task 1: Move `bundled.json` → `catalog.json` at repo root

**Files:**
- Create: `catalog.json`
- Delete: `src/catalog/bundled.json`
- Modify: `src/catalog/loader.ts:6`
- Modify: `package.json` `"files"`
- Rename: `tests/catalog/bundled.test.ts` → `tests/catalog/catalog-json.test.ts`

- [ ] **Step 1: Move the file**

```bash
git mv src/catalog/bundled.json catalog.json
```

- [ ] **Step 2: Update loader import path**

Edit `src/catalog/loader.ts` line 6:

```ts
// before
import bundledJson from './bundled.json' with { type: 'json' };
// after
import bundledJson from '../../catalog.json' with { type: 'json' };
```

- [ ] **Step 3: Update `package.json` "files" field**

Change in `package.json`:

```json
"files": [
  "dist",
  "catalog.json"
],
```

- [ ] **Step 4: Rename and update the bundled-catalog test**

```bash
git mv tests/catalog/bundled.test.ts tests/catalog/catalog-json.test.ts
```

Replace the entire file contents with:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('root catalog.json', () => {
  it('parses against the schema', () => {
    const path = fileURLToPath(new URL('../../catalog.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(() => CatalogSchema.parse(json)).not.toThrow();
  });

  it('contains a non-empty items array', () => {
    const path = fileURLToPath(new URL('../../catalog.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBeGreaterThan(0);
  });
});
```

(Note: the previous test asserted a hardcoded id list that is now stale. Replacing with a presence check keeps the test useful without making it a maintenance burden every time an item is added.)

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: all tests pass. The catalog-json test discovers `catalog.json` at the new path; loader continues to compile because the import resolved.

- [ ] **Step 6: Commit**

```bash
git add catalog.json src/catalog/loader.ts package.json tests/catalog/catalog-json.test.ts
git rm src/catalog/bundled.json tests/catalog/bundled.test.ts 2>/dev/null || true
git commit -m "refactor(catalog): consolidate bundled.json into root catalog.json"
```

---

## Task 2: Add `default?: boolean` to schema and types

**Files:**
- Modify: `src/types.ts:25-37`
- Modify: `src/catalog/schema.ts:21-33`
- Modify: `tests/catalog/schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/catalog/schema.test.ts` (inside the existing describe block, or a new one — match the file's existing style):

```ts
import { CatalogItemSchema } from '../../src/catalog/schema.js';

describe('CatalogItemSchema default field', () => {
  const base = {
    id: 'x', name: 'x', description: '', kind: 'tool',
    defaultScope: 'global',
    detect: { command: 'x -v' },
    install: { command: 'echo' },
  };

  it('accepts default: true', () => {
    expect(() => CatalogItemSchema.parse({ ...base, default: true })).not.toThrow();
  });

  it('accepts default: false', () => {
    expect(() => CatalogItemSchema.parse({ ...base, default: false })).not.toThrow();
  });

  it('accepts items without a default field', () => {
    expect(() => CatalogItemSchema.parse(base)).not.toThrow();
  });

  it('rejects default as a string', () => {
    expect(() => CatalogItemSchema.parse({ ...base, default: 'true' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test tests/catalog/schema.test.ts`
Expected: the four new tests fail (the string-rejection one may pass coincidentally — Zod will reject unknown keys depending on `.strict()` usage; if it currently passes because of unknown-key rejection, that's fine, leave as-is).

- [ ] **Step 3: Add field to types**

Edit `src/types.ts`, in the `CatalogItem` interface (around line 36, after `postInstall`):

```ts
export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  homepage?: string;
  defaultScope: Scope;
  detect: DetectSpec;
  install: CommandSpec;
  uninstall?: CommandSpec;
  update?: CommandSpec;
  postInstall?: PostInstallAction[];
  /** When true, included by `auto-claude default` (silent fleet install). */
  default?: boolean;
}
```

- [ ] **Step 4: Add field to Zod schema**

Edit `src/catalog/schema.ts`. In the `CatalogItemSchema` object (around line 32, after `postInstall`):

```ts
export const CatalogItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  kind: z.enum(['tool', 'plugin']),
  homepage: z.string().url().optional(),
  defaultScope: z.enum(['global', 'project']),
  detect: DetectSpecSchema,
  install: CommandSpecSchema,
  uninstall: CommandSpecSchema.optional(),
  update: CommandSpecSchema.optional(),
  postInstall: z.array(PostInstallActionSchema).optional(),
  default: z.boolean().optional(),
});
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `pnpm test tests/catalog/schema.test.ts && pnpm typecheck`
Expected: all four new tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/catalog/schema.ts tests/catalog/schema.test.ts
git commit -m "feat(catalog): add optional default flag to CatalogItem"
```

---

## Task 3: Mark default items in `catalog.json`

**Files:**
- Modify: `catalog.json`

- [ ] **Step 1: Add `"default": true` to the chosen items**

Open `catalog.json` and add `"default": true` to each of the following item objects (anywhere inside the object literal — convention: just after `"defaultScope"`):

- `claude-mem`
- `rtk`
- `gitnexus`
- `superpowers`
- `claude-code-setup`
- `microsoft-docs`
- `context7`
- `snip`

Example for `rtk`:

```json
{
  "id": "rtk",
  "name": "rtk",
  "description": "Rust Token Killer — token-optimized CLI proxy",
  "kind": "tool",
  "homepage": "https://github.com/rtk-ai/rtk",
  "defaultScope": "global",
  "default": true,
  "detect": { "command": "rtk --version" },
  ...
}
```

Leave all other items without the field (they default to `false`). Do not add `"default": true` to project-scoped items (`drunk-app`, `dknet-minimal`, `spec-kit`, `open-spec`) — fleet machines have no repo to initialize them in.

- [ ] **Step 2: Verify the catalog still parses**

Run: `pnpm test tests/catalog/catalog-json.test.ts`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add catalog.json
git commit -m "feat(catalog): flag fleet-default items with default: true"
```

---

## Task 4: `runDefaultList` — read-only listing

**Files:**
- Create: `src/commands/default.ts`
- Create: `tests/commands/default.test.ts`

- [ ] **Step 1: Write the failing test for filtering and grouping**

Create `tests/commands/default.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderDefaultList } from '../../src/commands/default.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, default: true },
  { id: 'cm',  name: 'cm',  description: '', kind: 'plugin', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, default: true },
  { id: 'nope', name: 'nope', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no default flag
];
const states: InstallState[] = [
  { itemId: 'rtk', installed: true, version: 'rtk 1.0' },
  { itemId: 'cm',  installed: false },
];

describe('renderDefaultList', () => {
  it('groups by kind and shows install state', () => {
    const out = renderDefaultList(items.filter((i) => i.default === true), states);
    expect(out).toMatch(/Default tools:/);
    expect(out).toMatch(/Default plugins:/);
    expect(out).toMatch(/rtk\s+installed/);
    expect(out).toMatch(/cm\s+not installed/);
    expect(out).not.toContain('nope');
  });

  it('omits a section when its kind has no defaults', () => {
    const onlyTools = items.filter((i) => i.default === true && i.kind === 'tool');
    const out = renderDefaultList(onlyTools, [{ itemId: 'rtk', installed: true }]);
    expect(out).toContain('Default tools:');
    expect(out).not.toContain('Default plugins:');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm test tests/commands/default.test.ts`
Expected: FAIL (`renderDefaultList` not exported / file missing).

- [ ] **Step 3: Create the command file with `renderDefaultList` and a wrapping `runDefaultList`**

Create `src/commands/default.ts`:

```ts
import type { CatalogItem, InstallState } from '../types.js';
import { detectStates } from '../engine/detect.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';

export interface RunDefaultListOptions {
  refreshCatalog?: boolean;
}

export async function runDefaultList(opts: RunDefaultListOptions = {}): Promise<void> {
  let catalog;
  try {
    catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  } catch (err) {
    process.stderr.write(`error: failed to load catalog: ${(err as Error).message}\n`);
    process.exitCode = 2;
    return;
  }
  const defaults = catalog.items.filter((i) => i.default === true);
  const states = await detectStates(defaults);
  process.stdout.write(renderDefaultList(defaults, states));
}

export function renderDefaultList(items: CatalogItem[], states: InstallState[]): string {
  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const tools   = items.filter((i) => i.kind === 'tool');
  const plugins = items.filter((i) => i.kind === 'plugin');

  const lines: string[] = [];
  if (tools.length > 0) {
    lines.push('Default tools:');
    for (const it of tools) lines.push(formatRow(it, stateById.get(it.id)));
    lines.push('');
  }
  if (plugins.length > 0) {
    lines.push('Default plugins:');
    for (const it of plugins) lines.push(formatRow(it, stateById.get(it.id)));
    lines.push('');
  }
  if (lines.length === 0) lines.push('No items are flagged as defaults.', '');
  return lines.join('\n');
}

function formatRow(item: CatalogItem, state: InstallState | undefined): string {
  const status = state?.installed ? 'installed' : 'not installed';
  const sep = process.stdout.isTTY ? '  ' : '\t';
  // Pad id to 14 chars only when TTY, for clean alignment.
  const id = process.stdout.isTTY ? item.id.padEnd(14) : item.id;
  return `  ${id}${sep}${status}`;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm test tests/commands/default.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/default.ts tests/commands/default.test.ts
git commit -m "feat(default): add runDefaultList for listing fleet defaults"
```

---

## Task 5: `runDefault` — silent installer

**Files:**
- Modify: `src/commands/default.ts`
- Modify: `tests/commands/default.test.ts`

The executor throws on per-item failure, so we drive it one item at a time and catch per-item errors to keep going. We also pre-detect to skip already-installed items.

- [ ] **Step 1: Write failing tests for the install flow**

Append to `tests/commands/default.test.ts`:

```ts
import { runDefaultInstall } from '../../src/commands/default.js';
import type { CatalogItem, EngineEvent } from '../../src/types.js';

function mkItem(id: string, kind: 'tool' | 'plugin' = 'tool'): CatalogItem {
  return {
    id, name: id, description: '', kind, defaultScope: 'global',
    detect: { command: `${id} -v` }, install: { command: `install-${id}` },
    default: true,
  };
}

describe('runDefaultInstall', () => {
  it('skips already-installed items and reports success', async () => {
    const events: EngineEvent[] = [];
    const result = await runDefaultInstall({
      items: [mkItem('rtk')],
      detect: async () => [{ itemId: 'rtk', installed: true }],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: () => {},
      err: () => {},
      onEvent: (e) => events.push(e),
    });
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    // run() should NOT have been called for an installed item
  });

  it('runs install for missing items and reports ok', async () => {
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [mkItem('rtk')],
      detect: async () => [{ itemId: 'rtk', installed: false }],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(calls).toEqual(['install-rtk']);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('continues after one item fails and exits non-zero', async () => {
    const result = await runDefaultInstall({
      items: [mkItem('a'), mkItem('b'), mkItem('c')],
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: false },
        { itemId: 'c', installed: false },
      ],
      run: async (cmd) =>
        cmd === 'install-b'
          ? { exitCode: 1, stdout: '', stderr: 'boom' }
          : { exitCode: 0, stdout: '', stderr: '' },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(result.ok).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('suppresses post-prompt events but logs a notice', async () => {
    const item: CatalogItem = {
      ...mkItem('cs', 'plugin'),
      postInstall: [{ type: 'claude-prompt', value: 'hello', label: 'greet' }],
    };
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [item],
      detect: async () => [{ itemId: 'cs', installed: false }],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: (m) => logs.push(m),
      err: () => {},
      onEvent: () => {},
    });
    expect(result.ok).toBe(1);
    expect(logs.some((l) => /post-install Claude prompt skipped/.test(l))).toBe(true);
  });

  it('reports nothing-to-do for an empty default set', async () => {
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [],
      detect: async () => [],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: (m) => logs.push(m),
      err: () => {},
      onEvent: () => {},
    });
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(logs.some((l) => /nothing to do/.test(l))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm test tests/commands/default.test.ts`
Expected: FAIL (`runDefaultInstall` not exported).

- [ ] **Step 3: Add `runDefaultInstall` and the `runDefault` wrapper**

Append to `src/commands/default.ts`:

```ts
import { executeInstall } from '../engine/executor.js';
import { orderForInstall } from '../engine/ordering.js';
import { realShellRunner, type ShellRunner } from '../engine/detect.js';
import type { EngineEvent, InstallState } from '../types.js';

export interface RunDefaultInstallDeps {
  items: CatalogItem[];
  detect: (items: CatalogItem[]) => Promise<InstallState[]>;
  run: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  log: (msg: string) => void;
  err: (msg: string) => void;
  onEvent: (e: EngineEvent) => void;
}

export interface DefaultInstallResult {
  ok: number;
  failed: number;
  skipped: number;
}

export async function runDefaultInstall(deps: RunDefaultInstallDeps): Promise<DefaultInstallResult> {
  const result: DefaultInstallResult = { ok: 0, failed: 0, skipped: 0 };
  if (deps.items.length === 0) {
    deps.log('default: nothing to do (no items flagged default: true)');
    return result;
  }

  const ordered = orderForInstall(deps.items);
  const states = await deps.detect(ordered);
  const installedIds = new Set(states.filter((s) => s.installed).map((s) => s.itemId));

  for (const item of ordered) {
    if (installedIds.has(item.id)) {
      deps.log(`↺ ${item.id} already installed`);
      result.skipped++;
      result.ok++;
      continue;
    }

    deps.log(`→ ${item.id}`);

    // Wrap the real onEvent to:
    //  - suppress post-prompt and emit a notice instead
    //  - forward everything else
    const wrappedOnEvent = (e: EngineEvent) => {
      if (e.type === 'post-prompt') {
        deps.log(`ⓘ ${e.itemId}: post-install Claude prompt skipped (run \`auto-claude\` interactively to see it)`);
        return;
      }
      deps.onEvent(e);
    };

    try {
      await executeInstall(
        { selected: [item], pluginScope: 'global', repoRoot: null },
        {
          run: deps.run,
          onEvent: wrappedOnEvent,
          dryRun: false,
        },
      );
      deps.log(`✓ ${item.id}`);
      result.ok++;
    } catch (e) {
      deps.err(`✗ ${item.id}: ${(e as Error).message}`);
      result.failed++;
    }
  }

  deps.log(`default: ${result.ok} ok, ${result.failed} failed, ${result.skipped} skipped`);
  return result;
}

export interface RunDefaultOptions {
  refreshCatalog?: boolean;
}

export async function runDefault(opts: RunDefaultOptions = {}): Promise<void> {
  let catalog;
  try {
    catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  } catch (err) {
    process.stderr.write(`error: failed to load catalog: ${(err as Error).message}\n`);
    process.exitCode = 2;
    return;
  }

  const defaults = catalog.items.filter((i) => i.default === true);

  const richRun: RunDefaultInstallDeps['run'] = async (cmd, runOpts) => {
    // executor expects a RichRunner; ShellRunner returns the same shape.
    const r = await realShellRunner(cmd);
    return r;
  };

  const result = await runDefaultInstall({
    items: defaults,
    detect: async (items) => (await import('../engine/detect.js')).detectStates(items),
    run: richRun,
    log: (m) => process.stdout.write(m + '\n'),
    err: (m) => process.stderr.write(m + '\n'),
    onEvent: () => { /* progress already logged via item-level log() calls */ },
  });

  if (result.failed > 0) process.exitCode = 1;
}
```

(Note: `realShellRunner` already takes a single `cmdline` and ignores `cwd`. For the `default` command we don't need per-command `cwd` because we never run in repo scope. If a future item needs `cwd`, the `richRun` wrapper is the place to add it.)

- [ ] **Step 4: Run tests, verify all pass**

Run: `pnpm test tests/commands/default.test.ts && pnpm typecheck`
Expected: all five new tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/commands/default.ts tests/commands/default.test.ts
git commit -m "feat(default): add runDefault silent installer"
```

---

## Task 6: Wire `default` subcommand into the CLI

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add the subcommand**

Edit `src/cli.ts`. After the `update` command registration, before `program.parseAsync`:

```ts
import { runDefault, runDefaultList } from './commands/default.js';

program.command('default')
  .description('Silently install all catalog items flagged default: true (global scope, non-interactive)')
  .option('--refresh-catalog', 'force re-fetch catalog')
  .option('-l, --list', 'list default items and their installed state, then exit')
  .action(async (opts) => {
    if (opts.list) {
      await runDefaultList({ refreshCatalog: !!opts.refreshCatalog });
    } else {
      await runDefault({ refreshCatalog: !!opts.refreshCatalog });
    }
  });
```

(Ensure the `import` line is grouped with the other command imports at the top of the file.)

- [ ] **Step 2: Build and smoke-test --list**

Run:

```bash
pnpm build
node dist/cli.js default --list
```

Expected: prints `Default tools:` and `Default plugins:` sections with each flagged item on its own line. Exit code `0`.

- [ ] **Step 3: Smoke-test --help**

Run: `node dist/cli.js default --help`
Expected: shows the description, `--refresh-catalog`, and `-l, --list` flags.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test && pnpm typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): wire `auto-claude default` and `default --list` subcommands"
```

---

## Task 7: E2E test for `default --list`

**Files:**
- Create: `tests/e2e/default.e2e.test.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/default.e2e.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const cli = join(repoRoot, 'dist', 'cli.js');

describe('e2e: auto-claude default --list', () => {
  beforeAll(async () => {
    if (!existsSync(cli)) {
      await execa('pnpm', ['build'], { cwd: repoRoot });
    }
  });

  it('prints Default tools and Default plugins sections', async () => {
    const r = await execa('node', [cli, 'default', '--list'], { reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Default tools:/);
    expect(r.stdout).toMatch(/Default plugins:/);
  }, 30_000);

  it('alias -l works the same way', async () => {
    const r = await execa('node', [cli, 'default', '-l'], { reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Default tools:/);
  }, 30_000);
});
```

- [ ] **Step 2: Run the E2E test**

Run: `pnpm test tests/e2e/default.e2e.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full test suite once more**

Run: `pnpm test && pnpm typecheck`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/default.e2e.test.ts
git commit -m "test(e2e): cover `auto-claude default --list`"
```

---

## Task 8: Update CLAUDE.md command table

**Files:**
- Modify: `CLAUDE.md` (commands table)

- [ ] **Step 1: Add two rows to the command table**

In `CLAUDE.md`, in the commands table, add:

```markdown
| `npx auto-claude default` | Silently install all `default: true` items globally (for fleet automation) |
| `npx auto-claude default --list` | List default items and their installed state |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document `auto-claude default` subcommand"
```

---

## Self-Review Notes

- **Spec coverage**
  - CLI surface (`default`, `--list`, `-l`) — Task 6.
  - Exit codes 0/1/2 — Task 5 (`process.exitCode` set in `runDefault`).
  - Schema field — Task 2; rejection of string `"true"` — Task 2 step 1.
  - Catalog consolidation + repo root — Task 1.
  - `package.json` files update — Task 1 step 3.
  - Idempotency via pre-detect — Task 5.
  - Continue-on-failure — Task 5 (loop catches per-item throws).
  - Post-prompt suppression with notice — Task 5 test + impl.
  - Plugin scope hardcoded `global` — Task 5 (`pluginScope: 'global'` in `executeInstall` call).
  - No-TTY-friendly output — Task 4 (`formatRow`); install path uses plain text.
  - Test plan — Tasks 2, 4, 5, 7.
  - Migration described in spec — Tasks 1 + 2 + 3 (one logical migration, three commits).
- **Placeholder scan:** every step has concrete code or an exact command. No TBDs.
- **Type consistency:** `runDefaultInstall`, `runDefault`, `runDefaultList`, `renderDefaultList`, `DefaultInstallResult`, `RunDefaultInstallDeps` are used identically in the test file and the implementation file. Property names (`ok`, `failed`, `skipped`) match across both.
