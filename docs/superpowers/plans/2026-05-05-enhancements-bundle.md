# auto-claude Enhancements Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four enhancements described in `docs/superpowers/specs/2026-05-05-enhancements-bundle-design.md` — recolor catalog group names blue, add a `kind: 'mcp'` catalog item type, add `microsoft/skills` + `microsoft/azure-skills` plugin entries (with a group rename), and add a GitHub Actions auto-version+publish workflow.

**Architecture:** Four phased changes against the existing v2 catalog/Ink wizard architecture. Phase 1 is a pure color refactor. Phase 2 is JSON + tests. Phase 3 introduces a discriminated-union `CatalogItem` so MCP items skip the shell-runner path and instead read/write `<repoRoot>/.mcp.json` through a small dedicated helper module. Phase 4 ships a `pnpm`-based `paulhatch/semantic-version` workflow modeled on `baoduy/outline-openspec-mcp`.

**Tech Stack:** TypeScript (ESM), Ink 5 + React 19, Zod 4, vitest 4, pnpm 9, GitHub Actions.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/ui/theme.ts` | Modify | Add `COLORS.group`, `COLORS.mcp`, glyph + ANSI for both |
| `src/ui/ItemList.tsx` | Modify | Render group name in `COLORS.group`; render `mcp` kind visuals |
| `src/commands/status.ts` | Modify | `paint('group')` for group name; `mcp` kind glyph/color |
| `src/commands/default.ts` | Modify | `paint('group')` for group name |
| `src/types.ts` | Modify | Convert `CatalogItem` to discriminated union with `McpItem` |
| `src/catalog/schema.ts` | Modify | `z.discriminatedUnion` over `kind` |
| `src/engine/mcp-config.ts` | **Create** | All `.mcp.json` IO (read / merge / write / remove) |
| `src/engine/detect.ts` | Modify | Branch to `mcp-config` for `mcp` kind |
| `src/engine/executor.ts` | Modify | Branch to `mcp-config` for `mcp` kind install/uninstall |
| `src/ui/App.tsx` | Modify | Filter `mcp` items when no `repoRoot` |
| `catalog.json` | Modify | Rename `core-plugins`; add MS entries; add `mcp-servers` group |
| `src/catalog/bundled.json` | Modify | Same edits as `catalog.json` (kept in sync) |
| `package.json` | Modify | Add `packageManager` pin |
| `.github/workflows/npm-publish.yaml` | **Create** | Auto-version + publish to npm |
| `README.md` | Modify | Add Releases section noting `NPM_TOKEN` |
| `tests/engine/mcp-config.test.ts` | **Create** | Unit tests for the helper |
| `tests/engine/executor-mcp.test.ts` | **Create** | Engine event flow for mcp items |
| `tests/engine/detect.test.ts` | Modify | Add `mcp` branch coverage |
| `tests/catalog/schema.test.ts` | Modify | Validate `mcp` item; reject malformed |
| `tests/catalog/catalog-json.test.ts` | Modify | Assert renamed group name + new entries |
| `tests/ui/ItemList.test.tsx` | Modify | Group color, mcp visuals |
| `tests/e2e/install-mcp.test.ts` | **Create** | End-to-end: select MCPs → `.mcp.json` populated |

---

## Phase 1 — Group name color → blue

### Task 1.1: Add `COLORS.group` and `'group'` PaintColor

**Files:**
- Modify: `src/ui/theme.ts`
- Test: `tests/ui/theme.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

Create `tests/ui/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { COLORS, paint } from '../../src/ui/theme.js';

describe('theme', () => {
  it('exposes a blue COLORS.group', () => {
    expect(COLORS.group).toBe('blue');
  });

  it('paint("group") emits the blue ANSI escape on a TTY', () => {
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      expect(paint('hi', 'group')).toBe('\x1b[34mhi\x1b[0m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/theme.test.ts`
Expected: FAIL — `COLORS.group` is undefined; `paint(..., 'group')` is a type error.

- [ ] **Step 3: Implement minimal change**

In `src/ui/theme.ts`:
- Add `group: 'blue',` to the `COLORS` object (place it under `info`).
- Add `| 'group'` to the `PaintColor` type union.
- Add `group: '\x1b[34m',` to the `ANSI` record.

Final `COLORS` block:

```ts
export const COLORS = {
  brand: '#D97706',
  tool: 'cyan',
  plugin: 'magenta',
  ok: 'green',
  fail: 'red',
  warn: 'yellow',
  info: 'blue',
  group: 'blue',
  cursor: 'cyan',
} as const;
```

Final `PaintColor` and `ANSI`:

```ts
export type PaintColor =
  | 'brand' | 'tool' | 'plugin' | 'ok' | 'fail' | 'warn' | 'info'
  | 'group' | 'cursor' | 'dim' | 'bold';

const ANSI: Record<PaintColor, string> = {
  brand: '\x1b[38;2;217;119;6m',
  tool: '\x1b[36m',
  plugin: '\x1b[35m',
  ok: '\x1b[32m',
  fail: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[34m',
  group: '\x1b[34m',
  cursor: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/ui/theme.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.ts tests/ui/theme.test.ts
git commit -m "feat(theme): add COLORS.group (blue) for catalog group titles"
```

---

### Task 1.2: Use `COLORS.group` in `ItemList`

**Files:**
- Modify: `src/ui/ItemList.tsx:93`
- Test: `tests/ui/ItemList.test.tsx`

- [ ] **Step 1: Write the failing assertion**

Append to `tests/ui/ItemList.test.tsx` (inside an existing `describe`):

```tsx
it('renders the group name with COLORS.group (blue)', () => {
  const { lastFrame } = render(
    <ItemList catalog={fixtureCatalog()} states={new Map()} cursor={0} selectedIds={new Set()} />
  );
  // ANSI escape for blue is [34m. Use a regex tolerant of bold ordering.
  expect(lastFrame()).toMatch(/\[(?:1m\[)?34m[^]*Memory backend/);
});
```

(If `fixtureCatalog()` does not exist in this file, reuse the inline catalog literal from the closest existing test in this same file. Repeat the inline literal — do not extract a helper for one test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/ItemList.test.tsx`
Expected: FAIL — group name still rendered with the orange truecolor escape `\x1b[38;2;217;119;6m`.

- [ ] **Step 3: Implement the change**

In `src/ui/ItemList.tsx` line 93, replace:

```tsx
<Text bold color={COLORS.brand}>
```

with:

```tsx
<Text bold color={COLORS.group}>
```

- [ ] **Step 4: Run all UI tests**

Run: `pnpm vitest run tests/ui`
Expected: PASS. If any other snapshot test compared against the orange escape for a group title, update it now to use the blue escape.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ItemList.tsx tests/ui/ItemList.test.tsx
git commit -m "feat(ui): render catalog group titles in blue"
```

---

### Task 1.3: Use `paint('group')` in `status` and `default --list`

**Files:**
- Modify: `src/commands/status.ts:14`
- Modify: `src/commands/default.ts:38`
- Test: `tests/e2e/default.e2e.test.ts` and (if present) status output tests.

- [ ] **Step 1: Update the call sites**

In `src/commands/status.ts:14`, replace:

```ts
lines.push(paint(`${g.name}${headerSuffix}:`, 'brand'));
```

with:

```ts
lines.push(paint(`${g.name}${headerSuffix}:`, 'group'));
```

In `src/commands/default.ts:38`, replace:

```ts
lines.push(paint(`${g.name}:`, 'brand'));
```

with:

```ts
lines.push(paint(`${g.name}:`, 'group'));
```

- [ ] **Step 2: Run command tests**

Run: `pnpm vitest run tests/e2e/default.e2e.test.ts`
Expected: PASS. If any test compares against the orange ANSI escape, update it to expect `\x1b[34m`.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/status.ts src/commands/default.ts tests/
git commit -m "feat(commands): use group color for status and default --list headers"
```

---

## Phase 2 — Rename `core-plugins` group + add Microsoft entries

### Task 2.1: Rename the `core-plugins` group

**Files:**
- Modify: `catalog.json` (group `id: "core-plugins"`)
- Modify: `src/catalog/bundled.json` (same edit — must stay in sync)
- Test: `tests/catalog/catalog-json.test.ts`

- [ ] **Step 1: Add a failing assertion**

In `tests/catalog/catalog-json.test.ts`, add:

```ts
import catalog from '../../catalog.json' with { type: 'json' };
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };

it('renames the core-plugins group to "Core plugins & skill packs"', () => {
  const fromCatalog = catalog.groups.find((g: any) => g.id === 'core-plugins');
  const fromBundled = bundled.groups.find((g: any) => g.id === 'core-plugins');
  expect(fromCatalog?.name).toBe('Core plugins & skill packs');
  expect(fromBundled?.name).toBe('Core plugins & skill packs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/catalog/catalog-json.test.ts`
Expected: FAIL — name is still `"Core Claude Code plugins"`.

- [ ] **Step 3: Update both JSON files**

In both `catalog.json` and `src/catalog/bundled.json`, find the group with `"id": "core-plugins"` and change:

```json
"name": "Core Claude Code plugins"
```

to:

```json
"name": "Core plugins & skill packs"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/catalog/catalog-json.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add catalog.json src/catalog/bundled.json tests/catalog/catalog-json.test.ts
git commit -m "feat(catalog): rename core-plugins group to 'Core plugins & skill packs'"
```

---

### Task 2.2: Resolve and document Microsoft marketplace plugin ids

**Files:**
- Modify (research): browse `https://github.com/microsoft/skills` and `https://github.com/microsoft/azure-skills` to find the marketplace's plugin manifest (`.claude-plugin/marketplace.json` or equivalent).
- Output: a short note in the commit message recording the resolved ids.

- [ ] **Step 1: Inspect each marketplace**

Run (or use a web fetch):

```bash
curl -s https://raw.githubusercontent.com/microsoft/skills/main/.claude-plugin/marketplace.json | head -200
curl -s https://raw.githubusercontent.com/microsoft/azure-skills/main/.claude-plugin/marketplace.json | head -200
```

Identify each marketplace's name + the list of plugin ids it exposes.

- [ ] **Step 2: Decide install strategy**

For each marketplace, choose one of:
- **Single umbrella id** if the marketplace publishes one canonical plugin.
- **Comma-joined `claude plugin install` calls** in a single `&&`-chain if multiple ids are needed.

Record the choice in a short note in `docs/superpowers/notes/microsoft-skills-resolution.md` (Create, ~10 lines):

```md
# microsoft-skills + azure-skills resolution

- microsoft/skills marketplace name: <NAME>
  - plugin ids installed: <id1>, <id2>, ...
- microsoft/azure-skills marketplace name: <NAME>
  - plugin ids installed: <id1>, <id2>, ...

Decision: single composite install command per repo (see catalog entries).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/microsoft-skills-resolution.md
git commit -m "docs: resolve plugin ids for microsoft/skills + azure-skills"
```

---

### Task 2.3: Add `microsoft-skills` and `azure-skills` catalog entries

**Files:**
- Modify: `catalog.json`
- Modify: `src/catalog/bundled.json`
- Test: `tests/catalog/catalog-json.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/catalog/catalog-json.test.ts`:

```ts
it('includes microsoft-skills and azure-skills in core-plugins, default:false', () => {
  const group = catalog.groups.find((g: any) => g.id === 'core-plugins')!;
  const ms = group.items.find((i: any) => i.id === 'microsoft-skills');
  const az = group.items.find((i: any) => i.id === 'azure-skills');
  expect(ms).toBeDefined();
  expect(az).toBeDefined();
  expect(ms.kind).toBe('plugin');
  expect(az.kind).toBe('plugin');
  expect(ms.default ?? false).toBe(false);
  expect(az.default ?? false).toBe(false);
  expect(ms.homepage).toBe('https://github.com/microsoft/skills');
  expect(az.homepage).toBe('https://github.com/microsoft/azure-skills');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/catalog/catalog-json.test.ts`
Expected: FAIL — entries don't exist yet.

- [ ] **Step 3: Add the entries to both JSON files**

In both `catalog.json` and `src/catalog/bundled.json`, inside the `core-plugins` group's `items` array, append (substituting `<MARKETPLACE>` and `<PLUGIN_IDS>` from the resolution note in Task 2.2):

```json
{
  "id": "microsoft-skills",
  "name": "microsoft/skills",
  "description": "Microsoft skill marketplace (general-purpose)",
  "kind": "plugin",
  "homepage": "https://github.com/microsoft/skills",
  "defaultScope": "global",
  "default": false,
  "detect":   { "command": "claude plugin list", "versionMatch": "<MARKETPLACE>" },
  "install":  { "command": "claude plugin marketplace add microsoft/skills && claude plugin install <PLUGIN_IDS>@<MARKETPLACE>" },
  "uninstall":{ "command": "claude plugin uninstall <PLUGIN_IDS>@<MARKETPLACE>" }
},
{
  "id": "azure-skills",
  "name": "microsoft/azure-skills",
  "description": "Microsoft Azure skill marketplace",
  "kind": "plugin",
  "homepage": "https://github.com/microsoft/azure-skills",
  "defaultScope": "global",
  "default": false,
  "detect":   { "command": "claude plugin list", "versionMatch": "<MARKETPLACE>" },
  "install":  { "command": "claude plugin marketplace add microsoft/azure-skills && claude plugin install <PLUGIN_IDS>@<MARKETPLACE>" },
  "uninstall":{ "command": "claude plugin uninstall <PLUGIN_IDS>@<MARKETPLACE>" }
}
```

- [ ] **Step 4: Validate via existing schema test**

Run: `pnpm vitest run tests/catalog`
Expected: PASS — including `schema.test.ts` (validates the JSON against the Zod schema) and the new assertion.

- [ ] **Step 5: Commit**

```bash
git add catalog.json src/catalog/bundled.json tests/catalog/catalog-json.test.ts
git commit -m "feat(catalog): add microsoft/skills and microsoft/azure-skills marketplaces"
```

---

## Phase 3 — `kind: 'mcp'` catalog item type

### Task 3.1: Convert `CatalogItem` to a discriminated union

**Files:**
- Modify: `src/types.ts`
- Test: `tests/catalog/schema.test.ts` (compilation-only at this step)

- [ ] **Step 1: Update `src/types.ts`**

Replace the existing `CatalogItem` interface (lines ~25-39) with:

```ts
export type ItemKind = 'tool' | 'plugin' | 'mcp';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface BaseCatalogItem {
  id: string;
  name: string;
  description: string;
  homepage?: string;
  default?: boolean;
}

export interface ToolItem extends BaseCatalogItem {
  kind: 'tool';
  defaultScope: Scope;
  detect: DetectSpec;
  install: CommandSpec;
  uninstall?: CommandSpec;
  update?: CommandSpec;
  postInstall?: PostInstallAction[];
}

export interface PluginItem extends BaseCatalogItem {
  kind: 'plugin';
  defaultScope: Scope;
  detect: DetectSpec;
  install: CommandSpec;
  uninstall?: CommandSpec;
  update?: CommandSpec;
  postInstall?: PostInstallAction[];
}

export interface McpItem extends BaseCatalogItem {
  kind: 'mcp';
  /** Key under which the server is written into .mcp.json's mcpServers. */
  mcpKey: string;
  mcpServer: McpServerConfig;
}

export type CatalogItem = ToolItem | PluginItem | McpItem;
```

Update `CatalogGroup.items: CatalogItem[]` — the type already accepts the union; no change needed beyond the new union definition.

- [ ] **Step 2: Run typecheck — expect new errors at consumer sites**

Run: `pnpm typecheck`
Expected: FAIL with errors at every site that accesses `item.install`, `item.detect`, `item.uninstall`, `item.update`, `item.postInstall`, or `item.defaultScope` without first narrowing `item.kind`. Common files: `src/engine/detect.ts`, `src/engine/executor.ts`, `src/engine/ordering.ts`, `src/commands/*`, `src/ui/*`.

- [ ] **Step 3: Add narrowing helpers**

Append to `src/types.ts`:

```ts
export function isMcpItem(item: CatalogItem): item is McpItem {
  return item.kind === 'mcp';
}

export function isShellItem(item: CatalogItem): item is ToolItem | PluginItem {
  return item.kind === 'tool' || item.kind === 'plugin';
}
```

- [ ] **Step 4: Fix call sites — guard with `isShellItem` everywhere mcp items are nonsensical**

Apply these narrowings (each is a small, mechanical edit):

- `src/engine/ordering.ts` — order is by kind; treat `mcp` like `tool` (install before plugins). If the file branches on `kind === 'tool'` change to `kind === 'tool' || kind === 'mcp'`.
- `src/engine/detect.ts` — handled in Task 3.4 (leave a TODO `if (item.kind === 'mcp') throw new Error('todo')` for now).
- `src/engine/executor.ts` — handled in Task 3.5 (leave a TODO `if (item.kind === 'mcp') throw new Error('todo')` for now and unblock typecheck for the rest by guarding all `item.install`/`item.uninstall`/`item.postInstall` accesses with `if (!isShellItem(item)) continue;`).
- `src/commands/status.ts` — when accessing `defaultScope`, guard with `isShellItem`.
- `src/commands/default.ts` — same.
- `src/commands/remove.ts` — same.
- `src/commands/update.ts` — same.
- `src/ui/ItemList.tsx` — visualsFor takes `CatalogItem`; access `kind` only (already does).
- `src/ui/App.tsx` — when computing the install plan, mcp items are valid `selected` entries; no changes other than typecheck-required narrowing.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: PASS — existing tests don't yet exercise mcp items, so behavior should be unchanged for tool/plugin items. Any test that fails because of an exception thrown by the executor/detect TODO branches indicates an unintended path; fix by ensuring no current test or fixture has `kind: 'mcp'`.

- [ ] **Step 7: Commit**

```bash
git add src/ tests/
git commit -m "refactor(types): convert CatalogItem to discriminated union with McpItem"
```

---

### Task 3.2: Update Zod schema to discriminated union

**Files:**
- Modify: `src/catalog/schema.ts`
- Test: `tests/catalog/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/catalog/schema.test.ts`:

```ts
import { CatalogItemSchema, CatalogSchema } from '../../src/catalog/schema.js';

describe('mcp item schema', () => {
  const valid = {
    id: 'context7-mcp',
    name: 'context7',
    description: 'Context7 MCP server',
    kind: 'mcp',
    mcpKey: 'context7',
    mcpServer: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  };

  it('accepts a valid mcp item', () => {
    expect(() => CatalogItemSchema.parse(valid)).not.toThrow();
  });

  it('rejects an mcp item missing mcpKey', () => {
    const { mcpKey: _omit, ...bad } = valid;
    expect(() => CatalogItemSchema.parse(bad)).toThrow();
  });

  it('rejects an mcp item with empty mcpServer.command', () => {
    expect(() => CatalogItemSchema.parse({ ...valid, mcpServer: { command: '' } })).toThrow();
  });

  it('rejects duplicate mcpKey across items', () => {
    const cat = {
      version: 2 as const,
      updatedAt: '2026-05-05',
      groups: [{
        id: 'g', name: 'g', kind: 'pick-many' as const,
        items: [valid, { ...valid, id: 'context7-mcp-2' }],
      }],
    };
    expect(() => CatalogSchema.parse(cat)).toThrow(/duplicate mcpKey/);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `pnpm vitest run tests/catalog/schema.test.ts`
Expected: FAIL — schema currently rejects `kind: 'mcp'`.

- [ ] **Step 3: Replace `CatalogItemSchema` with a discriminated union**

In `src/catalog/schema.ts`, replace the existing `CatalogItemSchema` definition with:

```ts
const McpServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

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
  default: z.boolean().optional(),
};

const ToolItemSchema = z.object({ ...ShellItemBase, kind: z.literal('tool') });
const PluginItemSchema = z.object({ ...ShellItemBase, kind: z.literal('plugin') });
const McpItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  homepage: z.string().url().optional(),
  kind: z.literal('mcp'),
  mcpKey: z.string().min(1),
  mcpServer: McpServerSchema,
  default: z.boolean().optional(),
});

export const CatalogItemSchema = z.discriminatedUnion('kind', [
  ToolItemSchema,
  PluginItemSchema,
  McpItemSchema,
]);
```

Then extend `CatalogSchema.superRefine` to track and reject duplicate `mcpKey`s. Add inside the `for (const group of cat.groups)` loop:

```ts
const seenMcpKeys = new Set<string>();
for (const item of group.items) {
  if (item.kind === 'mcp') {
    if (seenMcpKeys.has(item.mcpKey)) {
      ctx.addIssue({ code: 'custom', message: `duplicate mcpKey: ${item.mcpKey}` });
    }
    seenMcpKeys.add(item.mcpKey);
  }
}
```

(Place this block just before the closing brace of the existing `for (const group of cat.groups)` loop. Note: scope is per-catalog, so move `seenMcpKeys` declaration *outside* the loop if you want global uniqueness — for this plan, **global**: declare `const seenMcpKeys = new Set<string>();` adjacent to `seenItems`.)

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/catalog/schema.test.ts`
Expected: PASS — all four new tests plus existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/schema.ts tests/catalog/schema.test.ts
git commit -m "feat(schema): support kind: 'mcp' via discriminated union; reject duplicate mcpKey"
```

---

### Task 3.3: Create `mcp-config.ts` helper

**Files:**
- Create: `src/engine/mcp-config.ts`
- Create: `tests/engine/mcp-config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/mcp-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readMcpConfig,
  hasMcpServer,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  writeMcpConfig,
} from '../../src/engine/mcp-config.js';

function mkRepo(): string {
  return mkdtempSync(join(tmpdir(), 'mcp-test-'));
}

describe('mcp-config', () => {
  it('readMcpConfig returns empty mcpServers when file is missing', async () => {
    const repo = mkRepo();
    try {
      expect(await readMcpConfig(repo)).toEqual({ mcpServers: {} });
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('addMcpServer is a no-op when key already exists', () => {
    const cfg = { mcpServers: { foo: { command: 'a' } } };
    const next = addMcpServer(cfg, 'foo', { command: 'b' });
    expect(next.mcpServers.foo.command).toBe('a');
  });

  it('addMcpServer adds new keys without touching others', () => {
    const cfg = { mcpServers: { foo: { command: 'a' } } };
    const next = addMcpServer(cfg, 'bar', { command: 'b' });
    expect(next.mcpServers.foo.command).toBe('a');
    expect(next.mcpServers.bar.command).toBe('b');
  });

  it('updateMcpServer overwrites only the named key', () => {
    const cfg = { mcpServers: { foo: { command: 'a' }, bar: { command: 'b' } } };
    const next = updateMcpServer(cfg, 'foo', { command: 'a2' });
    expect(next.mcpServers.foo.command).toBe('a2');
    expect(next.mcpServers.bar.command).toBe('b');
  });

  it('removeMcpServer deletes the key, leaves others, leaves empty object', () => {
    const cfg = { mcpServers: { foo: { command: 'a' } } };
    const next = removeMcpServer(cfg, 'foo');
    expect(next.mcpServers).toEqual({});
  });

  it('hasMcpServer returns true only when the key is present', () => {
    expect(hasMcpServer({ mcpServers: { foo: { command: 'x' } } }, 'foo')).toBe(true);
    expect(hasMcpServer({ mcpServers: {} }, 'foo')).toBe(false);
  });

  it('writeMcpConfig creates .mcp.json with 2-space indent and trailing newline', async () => {
    const repo = mkRepo();
    try {
      await writeMcpConfig(repo, { mcpServers: { foo: { command: 'x' } } });
      const buf = await fs.readFile(join(repo, '.mcp.json'), 'utf-8');
      expect(buf).toBe('{\n  "mcpServers": {\n    "foo": {\n      "command": "x"\n    }\n  }\n}\n');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('readMcpConfig throws a typed error on malformed JSON', async () => {
    const repo = mkRepo();
    try {
      await fs.writeFile(join(repo, '.mcp.json'), '{not json', 'utf-8');
      await expect(readMcpConfig(repo)).rejects.toThrow(/\.mcp\.json/);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run tests — expect module-not-found**

Run: `pnpm vitest run tests/engine/mcp-config.test.ts`
Expected: FAIL — `src/engine/mcp-config.ts` doesn't exist.

- [ ] **Step 3: Implement the helper**

Create `src/engine/mcp-config.ts`:

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { McpServerConfig } from '../types.js';

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export async function readMcpConfig(repoRoot: string): Promise<McpConfig> {
  const path = join(repoRoot, '.mcp.json');
  let text: string;
  try {
    text = await fs.readFile(path, 'utf-8');
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return { mcpServers: {} };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Failed to parse ${path}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object') return { mcpServers: {} };
  const obj = parsed as Partial<McpConfig>;
  return { mcpServers: obj.mcpServers ?? {} };
}

export function hasMcpServer(cfg: McpConfig, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(cfg.mcpServers, key);
}

export function addMcpServer(cfg: McpConfig, key: string, server: McpServerConfig): McpConfig {
  if (hasMcpServer(cfg, key)) return cfg;
  return { mcpServers: { ...cfg.mcpServers, [key]: server } };
}

export function updateMcpServer(cfg: McpConfig, key: string, server: McpServerConfig): McpConfig {
  return { mcpServers: { ...cfg.mcpServers, [key]: server } };
}

export function removeMcpServer(cfg: McpConfig, key: string): McpConfig {
  if (!hasMcpServer(cfg, key)) return cfg;
  const next = { ...cfg.mcpServers };
  delete next[key];
  return { mcpServers: next };
}

export async function writeMcpConfig(repoRoot: string, cfg: McpConfig): Promise<void> {
  const path = join(repoRoot, '.mcp.json');
  const json = JSON.stringify(cfg, null, 2) + '\n';
  await fs.writeFile(path, json, 'utf-8');
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/engine/mcp-config.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/mcp-config.ts tests/engine/mcp-config.test.ts
git commit -m "feat(engine): add mcp-config helper for .mcp.json IO"
```

---

### Task 3.4: Wire `mcp` kind into `detect.ts`

**Files:**
- Modify: `src/engine/detect.ts`
- Modify: `tests/engine/detect.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine/detect.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('detects mcp items by reading .mcp.json from repoRoot', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'mcp-detect-'));
  try {
    await fs.writeFile(
      join(repo, '.mcp.json'),
      JSON.stringify({ mcpServers: { foo: { command: 'x' } } }),
      'utf-8',
    );
    const items = [{
      id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
      mcpKey: 'foo', mcpServer: { command: 'x' },
    }, {
      id: 'bar-mcp', name: 'Bar', description: '', kind: 'mcp' as const,
      mcpKey: 'bar', mcpServer: { command: 'y' },
    }];
    const states = await detectStates(items, async () => ({ exitCode: 0, stdout: '', stderr: '' }), repo);
    expect(states.find(s => s.itemId === 'foo-mcp')?.installed).toBe(true);
    expect(states.find(s => s.itemId === 'bar-mcp')?.installed).toBe(false);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

it('mcp items report installed:false when no repoRoot is provided', async () => {
  const items = [{
    id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
    mcpKey: 'foo', mcpServer: { command: 'x' },
  }];
  const states = await detectStates(items);
  expect(states[0]).toEqual({ itemId: 'foo-mcp', installed: false });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `pnpm vitest run tests/engine/detect.test.ts`
Expected: FAIL — `detectStates` does not accept a `repoRoot` arg yet, and the mcp branch doesn't exist.

- [ ] **Step 3: Update `detectStates` signature and add the mcp branch**

In `src/engine/detect.ts`, replace the file with:

```ts
import type { CatalogItem, InstallState } from '../types.js';
import { execa } from 'execa';
import { readMcpConfig, hasMcpServer } from './mcp-config.js';

export interface ShellRunner {
  (cmdline: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export const realShellRunner: ShellRunner = async (cmdline) => {
  const r = await execa(cmdline, { shell: true, reject: false });
  return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
};

export async function detectStates(
  items: CatalogItem[],
  run: ShellRunner = realShellRunner,
  repoRoot: string | null = null,
): Promise<InstallState[]> {
  // For mcp items, read the file once.
  let mcpConfig: { mcpServers: Record<string, unknown> } | null = null;
  if (repoRoot) {
    try { mcpConfig = await readMcpConfig(repoRoot); } catch { mcpConfig = { mcpServers: {} }; }
  }

  return Promise.all(items.map(async (item) => {
    if (item.kind === 'mcp') {
      if (!mcpConfig) return { itemId: item.id, installed: false };
      return { itemId: item.id, installed: hasMcpServer(mcpConfig as any, item.mcpKey) };
    }
    try {
      const r = await run(item.detect.command);
      if (r.exitCode !== 0) return { itemId: item.id, installed: false };
      if (item.detect.versionMatch) {
        const re = new RegExp(item.detect.versionMatch);
        const match = re.test(r.stdout);
        return { itemId: item.id, installed: match, version: match ? extractFirstLine(r.stdout) : undefined };
      }
      return { itemId: item.id, installed: true, version: extractFirstLine(r.stdout) };
    } catch {
      return { itemId: item.id, installed: false };
    }
  }));
}

function extractFirstLine(s: string): string | undefined {
  const line = s.split('\n')[0]?.trim();
  return line || undefined;
}
```

- [ ] **Step 4: Update callers**

Find all call sites: `pnpm exec rg -n 'detectStates\(' src tests`
For each call in `src/`, pass the third argument. Locations expected:
- `src/commands/install.tsx` (or `src/commands/install.tsx`'s caller in `src/ui/App.tsx`) — pass the resolved `repoRoot` from `resolveRepoRoot()`.
- `src/commands/status.ts` — pass `repoRoot` (resolve via `project.ts`).
- `src/commands/default.ts` — pass `repoRoot` (resolve, may be `null`).
- `src/commands/remove.ts` — pass `repoRoot`.
- `src/commands/update.ts` — pass `repoRoot`.

If any caller currently doesn't have `repoRoot`, import `resolveRepoRoot` from `../engine/project.js` and call it.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS — both new tests + all existing.

- [ ] **Step 6: Commit**

```bash
git add src/engine/detect.ts src/commands/ tests/engine/detect.test.ts
git commit -m "feat(engine): detect mcp items by reading .mcp.json"
```

---

### Task 3.5: Wire `mcp` kind into `executor.ts`

**Files:**
- Modify: `src/engine/executor.ts`
- Create: `tests/engine/executor-mcp.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/executor-mcp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeInstall } from '../../src/engine/executor.js';
import type { CatalogItem, EngineEvent, InstallPlan } from '../../src/types.js';

function fixture(repo: string, selected: CatalogItem[], uninstall: CatalogItem[] = []): InstallPlan {
  return { selected, uninstall, pluginScope: 'project', repoRoot: repo };
}

const fooMcp: CatalogItem = {
  id: 'foo-mcp', name: 'Foo MCP', description: '', kind: 'mcp',
  mcpKey: 'foo', mcpServer: { command: 'foo-cmd', args: ['--x'] },
};
const barMcp: CatalogItem = {
  id: 'bar-mcp', name: 'Bar MCP', description: '', kind: 'mcp',
  mcpKey: 'bar', mcpServer: { command: 'bar-cmd' },
};

describe('executeInstall (mcp)', () => {
  it('writes selected mcp items into .mcp.json', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-exec-'));
    try {
      const events: EngineEvent[] = [];
      await executeInstall(fixture(repo, [fooMcp, barMcp]), {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        onEvent: (e) => events.push(e),
        dryRun: false,
      });
      const cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.foo).toEqual({ command: 'foo-cmd', args: ['--x'] });
      expect(cfg.mcpServers.bar).toEqual({ command: 'bar-cmd' });
      expect(events.filter(e => e.type === 'item-success').length).toBe(2);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('skips mcp install when key already present (idempotent)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-idemp-'));
    try {
      await fs.writeFile(
        join(repo, '.mcp.json'),
        JSON.stringify({ mcpServers: { foo: { command: 'preexisting' } } }),
        'utf-8',
      );
      const events: EngineEvent[] = [];
      await executeInstall(fixture(repo, [fooMcp]), {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        onEvent: (e) => events.push(e),
        dryRun: false,
      });
      const cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.foo.command).toBe('preexisting');
      expect(events.find(e => e.type === 'item-success' && e.itemId === 'foo-mcp')).toBeDefined();
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('removes mcp keys on uninstall', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-rm-'));
    try {
      await fs.writeFile(
        join(repo, '.mcp.json'),
        JSON.stringify({ mcpServers: { foo: { command: 'x' }, bar: { command: 'y' } } }),
        'utf-8',
      );
      await executeInstall(fixture(repo, [], [fooMcp]), {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        onEvent: () => {},
        dryRun: false,
      });
      const cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.foo).toBeUndefined();
      expect(cfg.mcpServers.bar.command).toBe('y');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `pnpm vitest run tests/engine/executor-mcp.test.ts`
Expected: FAIL — executor still throws on `mcp` kind.

- [ ] **Step 3: Add `mcp` branch to `executor.ts`**

In `src/engine/executor.ts`:

1. Add imports at top:

```ts
import { readMcpConfig, addMcpServer, removeMcpServer, writeMcpConfig, hasMcpServer } from './mcp-config.js';
```

2. Add a helper near the top of the file:

```ts
async function applyMcpInstall(item: import('../types.js').McpItem, plan: InstallPlan): Promise<void> {
  if (!plan.repoRoot) throw new Error(`mcp item ${item.id} requires a project (repoRoot)`);
  const cfg = await readMcpConfig(plan.repoRoot);
  if (hasMcpServer(cfg, item.mcpKey)) return; // idempotent skip
  const next = addMcpServer(cfg, item.mcpKey, item.mcpServer);
  await writeMcpConfig(plan.repoRoot, next);
}

async function applyMcpUninstall(item: import('../types.js').McpItem, plan: InstallPlan): Promise<void> {
  if (!plan.repoRoot) return;
  const cfg = await readMcpConfig(plan.repoRoot);
  if (!hasMcpServer(cfg, item.mcpKey)) return;
  const next = removeMcpServer(cfg, item.mcpKey);
  await writeMcpConfig(plan.repoRoot, next);
}
```

3. In the **install loop** in `executeInstall`, replace the `if (opts.dryRun) ... else ...` block with:

```ts
if (item.kind === 'mcp') {
  if (opts.dryRun) {
    opts.record?.(`# write ${item.mcpKey} to .mcp.json`);
  } else {
    try {
      await applyMcpInstall(item, plan);
    } catch (err: any) {
      opts.onEvent({ type: 'item-failure', itemId: item.id, exitCode: 1, stderrTail: tailStderr(String(err?.message ?? err)) });
      throw new Error(`Install failed for ${item.id}: ${err?.message ?? err}`);
    }
  }
} else {
  if (opts.dryRun) {
    opts.record?.(item.install.command);
  } else {
    const r = await opts.run(item.install.command, cwd ? { cwd } : undefined);
    if (r.exitCode !== 0) {
      opts.onEvent({ type: 'item-failure', itemId: item.id, exitCode: r.exitCode, stderrTail: tailStderr(r.stderr) });
      throw new Error(`Install failed for ${item.id} (exit ${r.exitCode})`);
    }
  }
}
```

4. Apply the analogous change in the **uninstall loop**, replacing the `if (opts.dryRun) ... else ...` block with:

```ts
if (item.kind === 'mcp') {
  if (opts.dryRun) {
    opts.record?.(`# remove ${item.mcpKey} from .mcp.json`);
  } else {
    try {
      await applyMcpUninstall(item, plan);
    } catch (err: any) {
      opts.onEvent({ type: 'item-failure', itemId: item.id, exitCode: 1, stderrTail: tailStderr(String(err?.message ?? err)) });
      throw new Error(`Uninstall failed for ${item.id}: ${err?.message ?? err}`);
    }
  }
} else {
  opts.record?.(item.uninstall!.command);
  // (existing path retained for tool/plugin)
}
```

Note: the uninstall loop's filter `(plan.uninstall ?? []).filter((i) => i.uninstall)` will exclude mcp items because they have no `uninstall` field. **Update this filter** to:

```ts
const uninstalls = orderForUninstall(
  (plan.uninstall ?? []).filter((i) => i.kind === 'mcp' || i.uninstall),
);
```

5. `resolveCwd` already returns `undefined` for mcp items because `item.install` doesn't exist on `McpItem` — but TypeScript will complain. Update `resolveCwd`:

```ts
function resolveCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (item.kind === 'mcp') return undefined;
  if (item.install.cwd === 'repo-root' && plan.repoRoot) return plan.repoRoot;
  if (item.kind === 'plugin' && plan.pluginScope === 'project' && plan.repoRoot) return plan.repoRoot;
  return undefined;
}
```

6. The `for (const action of item.postInstall ?? [])` loop will fail typecheck — guard it:

```ts
if (item.kind !== 'mcp') {
  for (const action of item.postInstall ?? []) {
    await runPostInstall(item, action, plan, opts);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/engine`
Expected: PASS — new mcp tests + all existing executor tests.

- [ ] **Step 5: Run full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/executor.ts tests/engine/executor-mcp.test.ts
git commit -m "feat(engine): write/remove mcp items via .mcp.json instead of shell"
```

---

### Task 3.6: UI visuals for `mcp` kind

**Files:**
- Modify: `src/ui/theme.ts`
- Modify: `src/ui/ItemList.tsx`
- Modify: `src/commands/status.ts`
- Modify: `tests/ui/ItemList.test.tsx`

- [ ] **Step 1: Add color/glyph**

In `src/ui/theme.ts`:

- Add `mcp: 'green'` to `COLORS`.
- Add `mcp: '⚡'` to `GLYPHS`.
- Add `'mcp'` to the `PaintColor` union.
- Add `mcp: '\x1b[32m'` to the `ANSI` map.

- [ ] **Step 2: Render mcp visuals in `ItemList`**

In `src/ui/ItemList.tsx`'s `visualsFor` function, add a branch for `it.kind === 'mcp'`:

```ts
if (it.kind === 'mcp') {
  return {
    glyph: GLYPHS.mcp,
    color: COLORS.mcp,
    // existing fields (label/box/etc) follow the same shape as plugin/tool
    // — read the existing function and copy that shape verbatim with mcp glyph/color.
  };
}
```

(Read the current implementation and mirror the structure exactly — don't restructure.)

- [ ] **Step 3: Render mcp visuals in `status` plain-text output**

In `src/commands/status.ts`, wherever it renders an item's kind glyph (look for usage of `GLYPHS.tool` / `GLYPHS.plugin`), add a parallel branch for `'mcp'` using `GLYPHS.mcp` and `paint(..., 'mcp')`.

- [ ] **Step 4: Add a UI test**

Append to `tests/ui/ItemList.test.tsx`:

```tsx
it('renders an mcp item with the green ⚡ glyph', () => {
  const catalog = {
    version: 2 as const,
    updatedAt: '2026-05-05',
    groups: [{
      id: 'mcp-servers', name: 'MCP servers', kind: 'pick-many' as const,
      items: [{
        id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
        mcpKey: 'foo', mcpServer: { command: 'x' },
      }],
    }],
  };
  const { lastFrame } = render(
    <ItemList catalog={catalog} states={new Map()} cursor={0} selectedIds={new Set()} />
  );
  expect(lastFrame()).toContain('⚡');
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.ts src/ui/ItemList.tsx src/commands/status.ts tests/ui/ItemList.test.tsx
git commit -m "feat(ui): green ⚡ visuals for mcp items"
```

---

### Task 3.7: Filter `mcp` items when no repo

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/commands/default.ts`
- Test: `tests/ui/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/App.test.tsx`:

```tsx
it('omits mcp items from the wizard when repoRoot is null', () => {
  const catalog = {
    version: 2 as const,
    updatedAt: '2026-05-05',
    groups: [{
      id: 'mcp-servers', name: 'MCP servers (project)', kind: 'pick-many' as const,
      items: [{
        id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
        mcpKey: 'foo', mcpServer: { command: 'x' },
      }],
    }],
  };
  const { lastFrame } = render(<App catalog={catalog} initialStates={[]} repoRoot={null} />);
  expect(lastFrame()).not.toContain('foo-mcp');
  expect(lastFrame()).toContain('MCP items require a project');
});
```

(Adapt the `App` props shape to match the actual `App.tsx` signature — read it before writing this test.)

- [ ] **Step 2: Run test — expect failure**

Run: `pnpm vitest run tests/ui/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add filtering**

In `src/ui/App.tsx`:

- Compute a derived `displayCatalog` from `props.catalog`:

```ts
const displayCatalog = useMemo(() => {
  if (props.repoRoot) return props.catalog;
  return {
    ...props.catalog,
    groups: props.catalog.groups
      .map(g => ({ ...g, items: g.items.filter(i => i.kind !== 'mcp') }))
      .filter(g => g.items.length > 0),
  };
}, [props.catalog, props.repoRoot]);
```

- Pass `displayCatalog` (not `props.catalog`) to `ItemList`.
- If `props.repoRoot === null` and the original catalog contained any mcp items, render a dim-text line above the list:
  *"MCP items require a project (no repo detected)."*

- [ ] **Step 4: Apply same filter in `default.ts`**

In `src/commands/default.ts`, before iterating items, skip any `kind: 'mcp'` item if `repoRoot` is null. Add a one-line dim-text note to the output.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.tsx src/commands/default.ts tests/ui/App.test.tsx
git commit -m "feat: hide mcp items when no project repo is detected"
```

---

### Task 3.8: Add `mcp-servers` group with seed items to catalog

**Files:**
- Modify: `catalog.json`
- Modify: `src/catalog/bundled.json`
- Test: `tests/catalog/catalog-json.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/catalog/catalog-json.test.ts`:

```ts
it('contains an mcp-servers pick-many group', () => {
  const group = catalog.groups.find((g: any) => g.id === 'mcp-servers');
  expect(group).toBeDefined();
  expect(group.kind).toBe('pick-many');
  expect(group.name).toBe('MCP servers (project)');
});

it('seeds context7-mcp and microsoft-learn-mcp', () => {
  const group = catalog.groups.find((g: any) => g.id === 'mcp-servers')!;
  const c7 = group.items.find((i: any) => i.id === 'context7-mcp');
  const ms = group.items.find((i: any) => i.id === 'microsoft-learn-mcp');
  expect(c7).toBeDefined();
  expect(ms).toBeDefined();
  expect(c7.kind).toBe('mcp');
  expect(ms.kind).toBe('mcp');
  expect(typeof c7.mcpKey).toBe('string');
  expect(typeof ms.mcpKey).toBe('string');
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `pnpm vitest run tests/catalog/catalog-json.test.ts`
Expected: FAIL — group doesn't exist.

- [ ] **Step 3: Add the group + seeds to both JSON files**

In both `catalog.json` and `src/catalog/bundled.json`, append a new group at the end of the `groups` array:

```json
{
  "id": "mcp-servers",
  "name": "MCP servers (project)",
  "description": "Add MCP servers to this project's .mcp.json",
  "kind": "pick-many",
  "items": [
    {
      "id": "context7-mcp",
      "name": "Context7",
      "description": "Up-to-date library docs via Context7 MCP",
      "kind": "mcp",
      "homepage": "https://github.com/upstash/context7",
      "mcpKey": "context7",
      "mcpServer": {
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"]
      }
    },
    {
      "id": "microsoft-learn-mcp",
      "name": "Microsoft Learn",
      "description": "Microsoft Learn / Azure docs MCP server",
      "kind": "mcp",
      "homepage": "https://learn.microsoft.com",
      "mcpKey": "microsoft-learn",
      "mcpServer": {
        "command": "npx",
        "args": ["-y", "@microsoft/mcp-server-learn"]
      }
    }
  ]
}
```

> **Note on the Microsoft Learn MCP package name:** if `@microsoft/mcp-server-learn` is not the actual published name, the implementer should look up the correct npm package and adjust the `args`. The schema doesn't validate package existence — the e2e test in Task 3.9 only checks file structure.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/catalog`
Expected: PASS — including the existing schema validator (which will reject if anything is malformed).

- [ ] **Step 5: Commit**

```bash
git add catalog.json src/catalog/bundled.json tests/catalog/catalog-json.test.ts
git commit -m "feat(catalog): seed mcp-servers group with context7 and microsoft-learn MCPs"
```

---

### Task 3.9: End-to-end test — install MCPs, re-run, uninstall

**Files:**
- Create: `tests/e2e/install-mcp.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/install-mcp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeInstall } from '../../src/engine/executor.js';
import type { CatalogItem, InstallPlan } from '../../src/types.js';

const c7: CatalogItem = {
  id: 'context7-mcp', name: 'context7', description: '', kind: 'mcp',
  mcpKey: 'context7', mcpServer: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
};
const ms: CatalogItem = {
  id: 'microsoft-learn-mcp', name: 'ms-learn', description: '', kind: 'mcp',
  mcpKey: 'microsoft-learn', mcpServer: { command: 'npx', args: ['-y', '@microsoft/mcp-server-learn'] },
};

describe('e2e: install + re-run + uninstall mcp items', () => {
  it('installs both, second run is a no-op, uncheck removes only the unchecked key', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-e2e-'));
    try {
      const plan: InstallPlan = { selected: [c7, ms], pluginScope: 'project', repoRoot: repo };

      // First install
      await executeInstall(plan, { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), onEvent: () => {}, dryRun: false });
      let cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(Object.keys(cfg.mcpServers).sort()).toEqual(['context7', 'microsoft-learn']);

      // Re-run with same selection — file unchanged
      const before = await fs.readFile(join(repo, '.mcp.json'), 'utf-8');
      await executeInstall(plan, { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), onEvent: () => {}, dryRun: false });
      const after = await fs.readFile(join(repo, '.mcp.json'), 'utf-8');
      expect(after).toBe(before);

      // Uncheck context7 — should remove only that one
      const removePlan: InstallPlan = { selected: [ms], uninstall: [c7], pluginScope: 'project', repoRoot: repo };
      await executeInstall(removePlan, { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), onEvent: () => {}, dryRun: false });
      cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.context7).toBeUndefined();
      expect(cfg.mcpServers['microsoft-learn']).toBeDefined();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm vitest run tests/e2e/install-mcp.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/install-mcp.test.ts
git commit -m "test(e2e): mcp install + idempotent re-run + selective uninstall"
```

---

## Phase 4 — GitHub Actions auto-version + npm publish

### Task 4.1: Add `packageManager` pin

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Determine the local pnpm version**

Run: `pnpm --version`
Note the version (e.g. `9.12.3`).

- [ ] **Step 2: Add the field**

In `package.json`, add (top-level, alongside `"type": "module"`):

```json
"packageManager": "pnpm@<VERSION>"
```

(Substitute the version from Step 1.)

- [ ] **Step 3: Verify pnpm still installs cleanly**

Run: `pnpm install --frozen-lockfile`
Expected: success, no warnings about packageManager mismatch.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: pin packageManager to pnpm@<VERSION>"
```

---

### Task 4.2: Add the npm-publish workflow

**Files:**
- Create: `.github/workflows/npm-publish.yaml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/npm-publish.yaml`:

```yaml
name: npm-publish

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      release:
        description: "Publish to npm and create a GitHub release"
        required: false
        default: "true"

concurrency:
  group: npm-publish-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          fetch-tags: true

      - name: Calculate version
        id: version
        uses: paulhatch/semantic-version@v5.4.0
        with:
          tag_prefix: "v"
          major_pattern: "(MAJOR)"
          minor_pattern: "(MINOR)"
          version_format: "${major}.${minor}.${patch}"
          bump_each_commit: false
          search_commit_body: false

      - name: Set NEXT_VERSION
        run: echo "NEXT_VERSION=${{ steps.version.outputs.version }}" >> "$GITHUB_ENV"

      - name: Print the version
        run: echo "Next version is v${NEXT_VERSION}"

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://registry.npmjs.org/"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: |
          export NODE_OPTIONS="--max_old_space_size=4096"
          pnpm build

      - name: Update version in package.json
        run: npm version "${NEXT_VERSION}" --no-git-tag-version --allow-same-version

      - name: Determine release flag
        id: flag
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "enable=${{ github.event.inputs.release }}" >> "$GITHUB_OUTPUT"
          elif [ "${{ github.event_name }}" = "push" ] && [ "${{ github.ref }}" = "refs/heads/main" ]; then
            echo "enable=true" >> "$GITHUB_OUTPUT"
          else
            echo "enable=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Create GitHub Release
        if: steps.flag.outputs.enable == 'true'
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          make_latest: true
          tag_name: v${{ env.NEXT_VERSION }}
          name: Release v${{ env.NEXT_VERSION }}
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ github.token }}

      - name: Publish to npm
        if: steps.flag.outputs.enable == 'true'
        run: npm publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Lint the YAML**

Run: `pnpm exec yamllint .github/workflows/npm-publish.yaml || true` (skip if no yamllint installed). Otherwise eyeball it.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/npm-publish.yaml
git commit -m "ci: auto-version + publish to npm on push to main"
```

---

### Task 4.3: README — Releases section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a Releases section**

At the bottom of `README.md`, append:

```md
## Releases

Releases are published automatically by `.github/workflows/npm-publish.yaml`:

- Pushes to `main` (or manual `workflow_dispatch`) compute the next version from
  the commit log via [`paulhatch/semantic-version`](https://github.com/PaulHatch/semantic-version).
  Use `(MAJOR)` / `(MINOR)` in commit subjects to bump major/minor; otherwise patch.
- The workflow runs `pnpm typecheck && pnpm test && pnpm build`, updates
  `package.json`, creates a tagged GitHub Release, and publishes to npm.

**Required secret:** `NPM_TOKEN` — npm automation token with **Publish** permission.
Add it under *Settings → Secrets and variables → Actions* on the GitHub repo.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document npm-publish workflow and NPM_TOKEN requirement"
```

---

## Final verification

- [ ] **Step 1: Full suite**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 2: Wizard smoke test**

Run: `node dist/cli.js`
Inspect: group titles render blue; `mcp-servers` group appears with ⚡ glyphs (when run inside a repo); selecting MCPs writes `.mcp.json`.

- [ ] **Step 3: `default --list` smoke test**

Run: `node dist/cli.js default --list`
Inspect: group titles blue; mcp items shown with ⚡; `microsoft-skills` and `azure-skills` listed under *Core plugins & skill packs*.

- [ ] **Step 4: Push branch and open PR against `dev`** (per existing workflow conventions; see PR #8 as a template).

---

## Notes / known follow-ups

- The catalog's remote URL in `src/catalog/loader.ts` still has the `<owner>` placeholder. Out of scope for this plan; the publish workflow does not depend on it.
- The `microsoft-learn-mcp` package name in the seed entry is a best-guess (`@microsoft/mcp-server-learn`). Verify before merge and adjust `args` if needed.
- The `<MARKETPLACE>` and `<PLUGIN_IDS>` placeholders in the Microsoft entries (Task 2.3) must be resolved using the note from Task 2.2 before the catalog ships.
