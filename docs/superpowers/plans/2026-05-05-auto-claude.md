# auto-claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `auto-claude`, a Node.js + TypeScript Ink-based CLI/TUI utility that installs and manages a curated set of Claude Code tools and plugins, per the spec at `docs/superpowers/specs/2026-05-05-auto-claude-design.md`.

**Architecture:** Three-layer separation — `catalog/` (data loading & validation), `engine/` (headless detect/execute logic), `ui/` (Ink components). Default `npx auto-claude` runs an Ink wizard; subcommands `status`/`remove`/`update` reuse the engine. Catalog is fetched remotely with a 24h cache and a bundled offline fallback.

**Tech Stack:** TypeScript 5.x (ESM, NodeNext) · Ink 5 · zod · execa · commander · vitest · ink-testing-library · tsup · Node 20+

---

## File Structure

**Created in this plan:**

| File | Responsibility |
|---|---|
| `package.json` | npm metadata, scripts, `bin: { "auto-claude": "./dist/cli.js" }` |
| `tsconfig.json` | TS config, ESM/NodeNext, strict |
| `tsup.config.ts` | Bundler config — single ESM `dist/cli.js` |
| `vitest.config.ts` | Test runner config |
| `src/types.ts` | `CatalogItem`, `Catalog`, `PostInstallAction`, `Scope`, `ItemKind`, `InstallState` types |
| `src/catalog/schema.ts` | zod schemas mirroring `types.ts` |
| `src/catalog/bundled.json` | 4-item offline fallback catalog |
| `src/catalog/loader.ts` | Remote fetch + 24h cache (`~/.auto-claude/catalog.json`) + bundled fallback |
| `src/engine/project.ts` | Git-root detection via `git rev-parse --show-toplevel` |
| `src/engine/detect.ts` | Run `detect.command` per item, return `InstallState[]` |
| `src/engine/ordering.ts` | Sort selected items: globals → repo-aware tools → plugins |
| `src/engine/executor.ts` | Run install/uninstall/update + postInstall via execa; supports dry-run mode emitting recorded commands; emits typed events |
| `src/ui/ItemList.tsx` | Ink checkbox list grouped by kind, with installed-state badges |
| `src/ui/PluginScopePrompt.tsx` | One-shot global/project radio for plugins |
| `src/ui/ConfirmSummary.tsx` | List of pending actions + enter/q to proceed/abort |
| `src/ui/ProgressLog.tsx` | Streaming per-step progress lines |
| `src/ui/PostInstallPanel.tsx` | Final panel showing claude-prompt actions |
| `src/ui/App.tsx` | Wizard orchestrator wiring screens to engine events |
| `src/commands/install.ts` | Default subcommand — load catalog, render Ink wizard |
| `src/commands/status.ts` | Plain-stdout status table |
| `src/commands/remove.ts` | Wizard listing only installed items, runs `uninstall` |
| `src/commands/update.ts` | Runs `update` for installed items, optional `--only <id>` |
| `src/cli.ts` | commander entry, routes to commands, parses `--refresh-catalog` |
| `catalog.json` | Source-of-truth catalog at repo root (will be served via raw.githubusercontent) |
| `tests/**` | vitest tests mirroring `src/` paths |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore` (extend), `src/cli.ts` (stub)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "auto-claude",
  "version": "0.1.0",
  "description": "Curated installer for Claude Code tools and plugins",
  "type": "module",
  "bin": { "auto-claude": "./dist/cli.js" },
  "files": ["dist", "src/catalog/bundled.json"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "execa": "^9.5.1",
    "ink": "^5.0.1",
    "react": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "ink-testing-library": "^4.0.0",
    "tsup": "^8.3.5",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  loader: { '.json': 'json' },
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
  },
});
```

- [ ] **Step 5: Append to `.gitignore`**

```
# auto-claude
dist/
*.tsbuildinfo
.vitest-cache
```

- [ ] **Step 6: Create `src/cli.ts` stub**

```ts
console.log('auto-claude (stub)');
```

- [ ] **Step 7: Install deps and verify build**

Run: `npm install && npm run build && node dist/cli.js`
Expected: Prints `auto-claude (stub)`. Run `npm run typecheck` — exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore src/cli.ts
git commit -m "chore: scaffold auto-claude TypeScript + Ink project"
```

---

## Task 2: Type definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export type Scope = 'global' | 'project';
export type ItemKind = 'tool' | 'plugin';
export type Cwd = 'repo-root' | 'cwd';

export interface PostInstallAction {
  type: 'shell' | 'claude-prompt';
  value: string;
  requiresRepo?: boolean;
  label?: string;
}

export interface CommandSpec {
  command: string;
  cwd?: Cwd;
}

export interface DetectSpec {
  command: string;
  /** Regex applied to stdout. If absent, exit-code 0 == installed. */
  versionMatch?: string;
}

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
}

export interface Catalog {
  version: number;
  updatedAt: string;
  items: CatalogItem[];
}

export interface InstallState {
  itemId: string;
  installed: boolean;
  version?: string;
}

/** User selections + plugin scope choice produced by the wizard. */
export interface InstallPlan {
  selected: CatalogItem[];
  pluginScope: Scope;
  repoRoot: string | null;
}

/** Engine event types for streaming progress to the UI. */
export type EngineEvent =
  | { type: 'item-start'; itemId: string; label: string; index: number; total: number }
  | { type: 'item-success'; itemId: string }
  | { type: 'item-failure'; itemId: string; exitCode: number; stderrTail: string }
  | { type: 'post-shell-start'; itemId: string; label: string }
  | { type: 'post-shell-success'; itemId: string }
  | { type: 'post-shell-failure'; itemId: string; exitCode: number; stderrTail: string }
  | { type: 'post-prompt'; itemId: string; label: string; value: string }
  | { type: 'done' };
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add catalog and engine types"
```

---

## Task 3: Catalog zod schema

**Files:**
- Create: `src/catalog/schema.ts`, `tests/catalog/schema.test.ts`

- [ ] **Step 1: Write failing test `tests/catalog/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('CatalogSchema', () => {
  const valid = {
    version: 1,
    updatedAt: '2026-05-05',
    items: [{
      id: 'rtk',
      name: 'rtk',
      description: 'token proxy',
      kind: 'tool',
      defaultScope: 'global',
      detect: { command: 'rtk --version' },
      install: { command: 'npm i -g rtk' },
    }],
  };

  it('accepts a minimal valid catalog', () => {
    expect(() => CatalogSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown kind', () => {
    const bad = { ...valid, items: [{ ...valid.items[0], kind: 'addon' }] };
    expect(() => CatalogSchema.parse(bad)).toThrow();
  });

  it('rejects missing detect.command', () => {
    const bad = { ...valid, items: [{ ...valid.items[0], detect: {} }] };
    expect(() => CatalogSchema.parse(bad)).toThrow();
  });

  it('accepts optional postInstall actions', () => {
    const ok = {
      ...valid,
      items: [{
        ...valid.items[0],
        postInstall: [{ type: 'shell', value: 'rtk init -g', requiresRepo: true }],
      }],
    };
    expect(() => CatalogSchema.parse(ok)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/catalog/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/catalog/schema.ts`**

```ts
import { z } from 'zod';

const CommandSpecSchema = z.object({
  command: z.string().min(1),
  cwd: z.enum(['repo-root', 'cwd']).optional(),
});

const DetectSpecSchema = z.object({
  command: z.string().min(1),
  versionMatch: z.string().optional(),
});

const PostInstallActionSchema = z.object({
  type: z.enum(['shell', 'claude-prompt']),
  value: z.string().min(1),
  requiresRepo: z.boolean().optional(),
  label: z.string().optional(),
});

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
});

export const CatalogSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  items: z.array(CatalogItemSchema),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/catalog/schema.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/schema.ts tests/catalog/schema.test.ts
git commit -m "feat(catalog): add zod schema and tests"
```

---

## Task 4: Bundled catalog (initial 4 items)

**Files:**
- Create: `src/catalog/bundled.json`, `catalog.json` (repo-root copy), `tests/catalog/bundled.test.ts`

- [ ] **Step 1: Create `src/catalog/bundled.json`**

```json
{
  "version": 1,
  "updatedAt": "2026-05-05",
  "items": [
    {
      "id": "claude-mem",
      "name": "claude-mem",
      "description": "Persistent cross-session memory for Claude Code",
      "kind": "tool",
      "defaultScope": "global",
      "detect": { "command": "claude-mem --version" },
      "install":   { "command": "npm install -g @thedotmack/claude-mem" },
      "uninstall": { "command": "npm uninstall -g @thedotmack/claude-mem" },
      "update":    { "command": "npm install -g @thedotmack/claude-mem@latest" }
    },
    {
      "id": "rtk",
      "name": "rtk",
      "description": "Rust Token Killer — token-optimized CLI proxy",
      "kind": "tool",
      "defaultScope": "global",
      "detect": { "command": "rtk --version" },
      "install":   { "command": "npm install -g @rtk-ai/rtk" },
      "uninstall": { "command": "npm uninstall -g @rtk-ai/rtk" },
      "update":    { "command": "npm install -g @rtk-ai/rtk@latest" },
      "postInstall": [
        { "type": "shell", "value": "rtk init -g", "requiresRepo": true, "label": "Initializing rtk in repo" }
      ]
    },
    {
      "id": "superpowers",
      "name": "superpowers",
      "description": "Claude Code plugin: skills framework",
      "kind": "plugin",
      "defaultScope": "global",
      "detect": { "command": "claude plugin list", "versionMatch": "superpowers" },
      "install":   { "command": "claude plugin install superpowers@claude-plugins-official" },
      "uninstall": { "command": "claude plugin uninstall superpowers" }
    },
    {
      "id": "claude-code-setup",
      "name": "claude-code-setup",
      "description": "Claude Code plugin: automation recommender",
      "kind": "plugin",
      "defaultScope": "global",
      "detect": { "command": "claude plugin list", "versionMatch": "claude-code-setup" },
      "install":   { "command": "claude plugin install claude-code-setup@claude-plugins-official" },
      "uninstall": { "command": "claude plugin uninstall claude-code-setup" },
      "postInstall": [
        { "type": "claude-prompt", "label": "Trigger automation recommender",
          "value": "Ask Claude in this repo: \"recommend automations for this project\"" }
      ]
    }
  ]
}
```

> NOTE: The exact rtk install command (npm vs cargo vs shell) and the `claude plugin` project-scope mechanism are flagged as Open Items in the spec (§14). The npm-based commands above are placeholders that should be verified against rtk-ai/rtk's README and Anthropic's `claude plugin` docs during this task. If wrong, update both `src/catalog/bundled.json` and `catalog.json`.

- [ ] **Step 2: Verify rtk install command**

Run: `curl -s https://raw.githubusercontent.com/rtk-ai/rtk/main/README.md | head -100`
Expected: Read install instructions. Update `bundled.json` if the actual install command differs from the placeholder. Same for `claude plugin install` syntax — check `claude plugin --help`.

- [ ] **Step 3: Copy to repo root**

```bash
cp src/catalog/bundled.json catalog.json
```

- [ ] **Step 4: Write test `tests/catalog/bundled.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('bundled catalog', () => {
  it('parses against the schema', () => {
    const path = fileURLToPath(new URL('../../src/catalog/bundled.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(() => CatalogSchema.parse(json)).not.toThrow();
  });

  it('contains the four required items', () => {
    const path = fileURLToPath(new URL('../../src/catalog/bundled.json', import.meta.url));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    const ids = json.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(['claude-code-setup', 'claude-mem', 'rtk', 'superpowers']);
  });
});
```

- [ ] **Step 5: Run test**

Run: `npm test -- tests/catalog/bundled.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/catalog/bundled.json catalog.json tests/catalog/bundled.test.ts
git commit -m "feat(catalog): add bundled fallback catalog with 4 items"
```

---

## Task 5: Catalog loader (network → cache → bundled)

**Files:**
- Create: `src/catalog/loader.ts`, `tests/catalog/loader.test.ts`

The loader takes injected dependencies (fetch, fs, clock) so it's pure-testable.

- [ ] **Step 1: Write failing test `tests/catalog/loader.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { loadCatalog, type LoaderDeps } from '../../src/catalog/loader.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };

const validJson = JSON.stringify(bundled);

function makeDeps(overrides: Partial<LoaderDeps> = {}): LoaderDeps {
  return {
    fetchUrl: async () => ({ ok: true, body: validJson }),
    readCache: async () => null,
    writeCache: async () => {},
    bundled: bundled as never,
    now: () => new Date('2026-05-05T00:00:00Z').getTime(),
    cacheTtlMs: 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('loadCatalog', () => {
  it('returns remote catalog and writes cache on success', async () => {
    const writeCache = vi.fn(async () => {});
    const cat = await loadCatalog(makeDeps({ writeCache }));
    expect(cat.items).toHaveLength(4);
    expect(writeCache).toHaveBeenCalledOnce();
  });

  it('falls back to fresh cache when network fails', async () => {
    const cat = await loadCatalog(makeDeps({
      fetchUrl: async () => { throw new Error('offline'); },
      readCache: async () => ({
        json: validJson,
        writtenAt: new Date('2026-05-04T23:00:00Z').getTime(),
      }),
    }));
    expect(cat.items).toHaveLength(4);
  });

  it('falls back to bundled when network fails and cache is stale', async () => {
    const cat = await loadCatalog(makeDeps({
      fetchUrl: async () => { throw new Error('offline'); },
      readCache: async () => ({
        json: validJson,
        writtenAt: new Date('2026-04-25T00:00:00Z').getTime(), // >7d old
      }),
    }));
    expect(cat.items).toHaveLength(4);
  });

  it('falls back to bundled when remote returns malformed json', async () => {
    const cat = await loadCatalog(makeDeps({
      fetchUrl: async () => ({ ok: true, body: '{"not":"valid"}' }),
      readCache: async () => null,
    }));
    expect(cat.items).toHaveLength(4);
  });

  it('refresh=true bypasses cache', async () => {
    const fetchUrl = vi.fn(async () => ({ ok: true, body: validJson }));
    await loadCatalog({ ...makeDeps({ fetchUrl }), refresh: true });
    expect(fetchUrl).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/catalog/loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/catalog/loader.ts`**

```ts
import { CatalogSchema } from './schema.js';
import type { Catalog } from '../types.js';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REMOTE_URL = 'https://raw.githubusercontent.com/<owner>/auto-claude/main/catalog.json';
const FETCH_TIMEOUT_MS = 5000;
const STALE_CACHE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export interface FetchResult { ok: boolean; body: string }
export interface CacheEntry { json: string; writtenAt: number }

export interface LoaderDeps {
  fetchUrl: (url: string) => Promise<FetchResult>;
  readCache: () => Promise<CacheEntry | null>;
  writeCache: (entry: CacheEntry) => Promise<void>;
  bundled: Catalog;
  now: () => number;
  cacheTtlMs: number;
  refresh?: boolean;
}

export async function loadCatalog(deps: LoaderDeps): Promise<Catalog> {
  const { fetchUrl, readCache, writeCache, bundled, now, cacheTtlMs, refresh } = deps;

  // 1. Try fresh cache (skip if refresh=true)
  if (!refresh) {
    const cached = await readCache().catch(() => null);
    if (cached && now() - cached.writtenAt < cacheTtlMs) {
      const parsed = tryParse(cached.json);
      if (parsed) return parsed;
    }
  }

  // 2. Try network
  try {
    const res = await fetchUrl(REMOTE_URL);
    if (res.ok) {
      const parsed = tryParse(res.body);
      if (parsed) {
        await writeCache({ json: res.body, writtenAt: now() }).catch(() => {});
        return parsed;
      }
    }
  } catch { /* fall through */ }

  // 3. Stale cache (≤ 7d)
  const cached = await readCache().catch(() => null);
  if (cached && now() - cached.writtenAt < STALE_CACHE_MAX_MS) {
    const parsed = tryParse(cached.json);
    if (parsed) return parsed;
  }

  // 4. Bundled fallback
  return bundled;
}

function tryParse(json: string): Catalog | null {
  try {
    const obj = JSON.parse(json);
    return CatalogSchema.parse(obj);
  } catch {
    return null;
  }
}

/** Production deps — wires real fetch + filesystem. */
export function defaultDeps(opts: { refresh?: boolean } = {}): LoaderDeps {
  // Lazy import bundled to keep loader pure-testable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundled = require('./bundled.json') as Catalog;
  const cachePath = join(homedir(), '.auto-claude', 'catalog.json');

  return {
    fetchUrl: async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        return { ok: r.ok, body: await r.text() };
      } finally {
        clearTimeout(timer);
      }
    },
    readCache: async () => {
      try {
        const buf = await fs.readFile(cachePath, 'utf-8');
        const stat = await fs.stat(cachePath);
        return { json: buf, writtenAt: stat.mtimeMs };
      } catch { return null; }
    },
    writeCache: async (entry) => {
      await fs.mkdir(join(homedir(), '.auto-claude'), { recursive: true });
      await fs.writeFile(cachePath, entry.json, 'utf-8');
    },
    bundled,
    now: () => Date.now(),
    cacheTtlMs: 24 * 60 * 60 * 1000,
    refresh: opts.refresh,
  };
}
```

> Note: `defaultDeps` uses `require` for `bundled.json` to keep the loader function itself dependency-free. If your `tsup` bundle balks at `require` in ESM, replace with a top-level `import bundled from './bundled.json' with { type: 'json' };` and pass it explicitly. Both are equivalent functionally.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- tests/catalog/loader.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/loader.ts tests/catalog/loader.test.ts
git commit -m "feat(catalog): add loader with network/cache/bundled fallback"
```

---

## Task 6: Project (git-root) detection

**Files:**
- Create: `src/engine/project.ts`, `tests/engine/project.test.ts`

- [ ] **Step 1: Write failing test `tests/engine/project.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { findRepoRoot } from '../../src/engine/project.js';

describe('findRepoRoot', () => {
  it('returns trimmed stdout when git rev-parse succeeds', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '/Users/me/proj\n', stderr: '' }));
    expect(await findRepoRoot(run)).toBe('/Users/me/proj');
  });

  it('returns null when git rev-parse fails', async () => {
    const run = vi.fn(async () => ({ exitCode: 128, stdout: '', stderr: 'not a git repo' }));
    expect(await findRepoRoot(run)).toBeNull();
  });

  it('returns null when git binary is missing', async () => {
    const run = vi.fn(async () => { throw new Error('ENOENT'); });
    expect(await findRepoRoot(run)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/engine/project.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/engine/project.ts`**

```ts
import { execa } from 'execa';

export interface RunResult { exitCode: number; stdout: string; stderr: string }
export type Runner = (cmd: string, args: string[]) => Promise<RunResult>;

export const realRunner: Runner = async (cmd, args) => {
  const r = await execa(cmd, args, { reject: false });
  return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
};

export async function findRepoRoot(run: Runner = realRunner): Promise<string | null> {
  try {
    const r = await run('git', ['rev-parse', '--show-toplevel']);
    if (r.exitCode === 0) return r.stdout.trim() || null;
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/engine/project.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/project.ts tests/engine/project.test.ts
git commit -m "feat(engine): add git repo-root detection"
```

---

## Task 7: Detection engine

**Files:**
- Create: `src/engine/detect.ts`, `tests/engine/detect.test.ts`

- [ ] **Step 1: Write failing test `tests/engine/detect.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { detectStates } from '../../src/engine/detect.js';
import type { CatalogItem } from '../../src/types.js';

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'rtk --version' },
  install: { command: 'npm i -g rtk' },
  ...over,
});

describe('detectStates', () => {
  it('marks installed when exit code is 0 and no versionMatch', async () => {
    const states = await detectStates([item()],
      async () => ({ exitCode: 0, stdout: 'rtk 1.2.3', stderr: '' }));
    expect(states[0]).toEqual({ itemId: 'rtk', installed: true, version: 'rtk 1.2.3' });
  });

  it('marks not installed when exit code != 0', async () => {
    const states = await detectStates([item()],
      async () => ({ exitCode: 127, stdout: '', stderr: 'not found' }));
    expect(states[0].installed).toBe(false);
  });

  it('uses versionMatch regex against stdout', async () => {
    const it1 = item({ id: 'sp', detect: { command: 'list', versionMatch: 'superpowers' } });
    const states = await detectStates([it1],
      async () => ({ exitCode: 0, stdout: 'foo\nsuperpowers\nbar', stderr: '' }));
    expect(states[0].installed).toBe(true);
  });

  it('versionMatch miss => not installed even with exit 0', async () => {
    const it1 = item({ id: 'sp', detect: { command: 'list', versionMatch: 'superpowers' } });
    const states = await detectStates([it1],
      async () => ({ exitCode: 0, stdout: 'foo\nbar', stderr: '' }));
    expect(states[0].installed).toBe(false);
  });

  it('treats runner exception as not installed', async () => {
    const states = await detectStates([item()],
      async () => { throw new Error('ENOENT'); });
    expect(states[0].installed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `npm test -- tests/engine/detect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/engine/detect.ts`**

```ts
import type { CatalogItem, InstallState } from '../types.js';
import { execa } from 'execa';

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
): Promise<InstallState[]> {
  return Promise.all(items.map(async (item) => {
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

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/engine/detect.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/detect.ts tests/engine/detect.test.ts
git commit -m "feat(engine): add detection of installed items"
```

---

## Task 8: Ordering

**Files:**
- Create: `src/engine/ordering.ts`, `tests/engine/ordering.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { orderForInstall } from '../../src/engine/ordering.js';
import type { CatalogItem } from '../../src/types.js';

const i = (id: string, kind: 'tool' | 'plugin', requiresRepo = false): CatalogItem => ({
  id, name: id, description: '', kind, defaultScope: 'global',
  detect: { command: 'x' },
  install: { command: 'install ' + id },
  postInstall: requiresRepo ? [{ type: 'shell', value: 'init', requiresRepo: true }] : undefined,
});

describe('orderForInstall', () => {
  it('sorts globals → repo-aware tools → plugins, preserving inner order', () => {
    const items = [
      i('plugA', 'plugin'),
      i('rtk', 'tool', true),
      i('claude-mem', 'tool'),
      i('plugB', 'plugin'),
    ];
    const out = orderForInstall(items);
    expect(out.map((x) => x.id)).toEqual(['claude-mem', 'rtk', 'plugA', 'plugB']);
  });

  it('returns empty when given empty', () => {
    expect(orderForInstall([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/engine/ordering.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/engine/ordering.ts`**

```ts
import type { CatalogItem } from '../types.js';

function isRepoAware(item: CatalogItem): boolean {
  return (item.postInstall ?? []).some((p) => p.requiresRepo)
      || item.install.cwd === 'repo-root';
}

/** Order: global tools → repo-aware tools → plugins. Inner order preserved. */
export function orderForInstall(items: CatalogItem[]): CatalogItem[] {
  const globalTools: CatalogItem[] = [];
  const repoTools: CatalogItem[] = [];
  const plugins: CatalogItem[] = [];
  for (const it of items) {
    if (it.kind === 'plugin') plugins.push(it);
    else if (isRepoAware(it)) repoTools.push(it);
    else globalTools.push(it);
  }
  return [...globalTools, ...repoTools, ...plugins];
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/engine/ordering.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/ordering.ts tests/engine/ordering.test.ts
git commit -m "feat(engine): add install ordering (globals → repo-aware → plugins)"
```

---

## Task 9: Executor (with dry-run mode + event stream)

**Files:**
- Create: `src/engine/executor.ts`, `tests/engine/executor.test.ts`

The executor takes an `InstallPlan`, emits `EngineEvent`s via a callback, runs commands via injected `ShellRunner`. Supports `dryRun` mode that records commands without executing.

- [ ] **Step 1: Write failing test `tests/engine/executor.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import type { CatalogItem, EngineEvent, InstallPlan } from '../../src/types.js';

const tool: CatalogItem = {
  id: 'claude-mem', name: 'claude-mem', description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'cm --version' },
  install: { command: 'npm i -g cm' },
};
const rtk: CatalogItem = {
  id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'rtk --version' },
  install: { command: 'npm i -g rtk' },
  postInstall: [{ type: 'shell', value: 'rtk init -g', requiresRepo: true, label: 'init rtk' }],
};
const plug: CatalogItem = {
  id: 'sp', name: 'superpowers', description: '', kind: 'plugin', defaultScope: 'global',
  detect: { command: 'claude plugin list', versionMatch: 'superpowers' },
  install: { command: 'claude plugin install superpowers@x' },
  postInstall: [{ type: 'claude-prompt', value: 'ask claude X', label: 'lbl' }],
};

const plan = (overrides: Partial<InstallPlan> = {}): InstallPlan => ({
  selected: [tool, rtk, plug],
  pluginScope: 'global',
  repoRoot: '/repo',
  ...overrides,
});

describe('executeInstall', () => {
  it('runs install + post-install in order, emits events, halts on failure', async () => {
    const events: EngineEvent[] = [];
    const calls: string[] = [];
    const run = vi.fn(async (cmd: string) => {
      calls.push(cmd);
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await executeInstall(plan(), { run, onEvent: (e) => events.push(e), dryRun: false });

    expect(calls).toEqual([
      'npm i -g cm',
      'npm i -g rtk',
      'rtk init -g',
      'claude plugin install superpowers@x',
    ]);
    expect(events.find((e) => e.type === 'done')).toBeTruthy();
    expect(events.filter((e) => e.type === 'item-success').map((e: any) => e.itemId))
      .toEqual(['claude-mem', 'rtk', 'sp']);
    expect(events.filter((e) => e.type === 'post-prompt').length).toBe(1);
  });

  it('halts on first failure and emits item-failure', async () => {
    const events: EngineEvent[] = [];
    let n = 0;
    const run = async () => {
      n++;
      return n === 2
        ? { exitCode: 1, stdout: '', stderr: 'boom' }
        : { exitCode: 0, stdout: '', stderr: '' };
    };
    await expect(executeInstall(plan(), { run, onEvent: (e) => events.push(e), dryRun: false }))
      .rejects.toThrow();
    const failure = events.find((e) => e.type === 'item-failure') as any;
    expect(failure.itemId).toBe('rtk');
  });

  it('dryRun records commands without invoking runner', async () => {
    const run = vi.fn();
    const recorded: string[] = [];
    await executeInstall(plan(), {
      run: run as never,
      onEvent: () => {},
      dryRun: true,
      record: (c) => recorded.push(c),
    });
    expect(run).not.toHaveBeenCalled();
    expect(recorded).toEqual([
      'npm i -g cm',
      'npm i -g rtk',
      'rtk init -g',
      'claude plugin install superpowers@x',
    ]);
  });

  it('skips repo-aware post-install when repoRoot is null', async () => {
    const calls: string[] = [];
    const run = async (cmd: string) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; };
    await executeInstall(
      plan({ selected: [rtk], repoRoot: null }),
      { run, onEvent: () => {}, dryRun: false },
    );
    expect(calls).toEqual(['npm i -g rtk']); // rtk init -g skipped
  });

  it('plugin install runs in repoRoot cwd when pluginScope=project', async () => {
    const cwds: (string | undefined)[] = [];
    const run = async (cmd: string, opts?: { cwd?: string }) => {
      cwds.push(opts?.cwd);
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    await executeInstall(
      plan({ selected: [plug], pluginScope: 'project', repoRoot: '/repo' }),
      { run: run as never, onEvent: () => {}, dryRun: false },
    );
    expect(cwds[0]).toBe('/repo');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/engine/executor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/engine/executor.ts`**

```ts
import type { CatalogItem, EngineEvent, InstallPlan, PostInstallAction } from '../types.js';
import { orderForInstall } from './ordering.js';

export interface RichRunResult { exitCode: number; stdout: string; stderr: string }
export type RichRunner = (cmd: string, opts?: { cwd?: string }) => Promise<RichRunResult>;

export interface ExecuteOptions {
  run: RichRunner;
  onEvent: (e: EngineEvent) => void;
  dryRun: boolean;
  /** Called for each command in dryRun mode. */
  record?: (cmd: string) => void;
}

function resolveCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (item.install.cwd === 'repo-root' && plan.repoRoot) return plan.repoRoot;
  if (item.kind === 'plugin' && plan.pluginScope === 'project' && plan.repoRoot) return plan.repoRoot;
  return undefined;
}

function postCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (plan.repoRoot) return plan.repoRoot;
  return undefined;
}

const STDERR_TAIL_LINES = 10;
function tailStderr(s: string): string {
  return s.split('\n').slice(-STDERR_TAIL_LINES).join('\n');
}

export async function executeInstall(plan: InstallPlan, opts: ExecuteOptions): Promise<void> {
  const items = orderForInstall(plan.selected);
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const cwd = resolveCwd(item, plan);
    opts.onEvent({ type: 'item-start', itemId: item.id, label: item.name, index: i + 1, total });

    if (opts.dryRun) {
      opts.record?.(item.install.command);
    } else {
      const r = await opts.run(item.install.command, cwd ? { cwd } : undefined);
      if (r.exitCode !== 0) {
        opts.onEvent({ type: 'item-failure', itemId: item.id, exitCode: r.exitCode, stderrTail: tailStderr(r.stderr) });
        throw new Error(`Install failed for ${item.id} (exit ${r.exitCode})`);
      }
    }
    opts.onEvent({ type: 'item-success', itemId: item.id });

    for (const action of item.postInstall ?? []) {
      await runPostInstall(item, action, plan, opts);
    }
  }

  opts.onEvent({ type: 'done' });
}

async function runPostInstall(
  item: CatalogItem,
  action: PostInstallAction,
  plan: InstallPlan,
  opts: ExecuteOptions,
): Promise<void> {
  if (action.requiresRepo && !plan.repoRoot) return; // skip silently

  if (action.type === 'claude-prompt') {
    opts.onEvent({ type: 'post-prompt', itemId: item.id, label: action.label ?? '', value: action.value });
    return;
  }

  // shell
  const label = action.label ?? action.value;
  opts.onEvent({ type: 'post-shell-start', itemId: item.id, label });
  if (opts.dryRun) {
    opts.record?.(action.value);
  } else {
    const cwd = postCwd(item, plan);
    const r = await opts.run(action.value, cwd ? { cwd } : undefined);
    if (r.exitCode !== 0) {
      opts.onEvent({ type: 'post-shell-failure', itemId: item.id, exitCode: r.exitCode, stderrTail: tailStderr(r.stderr) });
      throw new Error(`Post-install failed for ${item.id} (exit ${r.exitCode})`);
    }
  }
  opts.onEvent({ type: 'post-shell-success', itemId: item.id });
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/engine/executor.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/executor.ts tests/engine/executor.test.ts
git commit -m "feat(engine): add executor with dry-run + event stream"
```

---

## Task 10: status command (text-only, easiest UX integration)

**Files:**
- Create: `src/commands/status.ts`, `tests/commands/status.test.ts`

Status renders a plain table — no Ink. Lets us verify the engine wiring end-to-end without UI complexity.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderStatus } from '../../src/commands/status.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'a', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: 'a -v' }, install: { command: '' } },
  { id: 'b', name: 'b', description: '', kind: 'plugin', defaultScope: 'global',
    detect: { command: 'b -v' }, install: { command: '' } },
];
const states: InstallState[] = [
  { itemId: 'a', installed: true, version: 'a 1.0.0' },
  { itemId: 'b', installed: false },
];

describe('renderStatus', () => {
  it('renders one line per item with badge and version', () => {
    const out = renderStatus(items, states);
    expect(out).toContain('a');
    expect(out).toContain('installed');
    expect(out).toContain('a 1.0.0');
    expect(out).toContain('b');
    expect(out).toContain('missing');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/commands/status.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/commands/status.ts`**

```ts
import type { CatalogItem, InstallState } from '../types.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';

export function renderStatus(items: CatalogItem[], states: InstallState[]): string {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  lines.push('auto-claude — status');
  lines.push('');
  for (const item of items) {
    const s = byId.get(item.id);
    const badge = s?.installed ? '✓ installed' : '✗ missing  ';
    const ver = s?.version ? `  (${s.version})` : '';
    lines.push(`  ${badge}  ${item.kind.padEnd(7)}  ${item.name}${ver}`);
  }
  return lines.join('\n');
}

export async function runStatus(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const states = await detectStates(catalog.items);
  console.log(renderStatus(catalog.items, states));
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/commands/status.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/commands/status.ts tests/commands/status.test.ts
git commit -m "feat(cmd): add status command"
```

---

## Task 11: ItemList Ink component

**Files:**
- Create: `src/ui/ItemList.tsx`, `tests/ui/ItemList.test.tsx`

A controlled checkbox list grouped by `kind`. Already-installed items are locked-checked (cannot toggle off here — uninstall lives in the `remove` command).

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ItemList } from '../../src/ui/ItemList.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'A-tool', description: 'desc A', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } },
  { id: 'b', name: 'B-plug', description: 'desc B', kind: 'plugin', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } },
];
const states: InstallState[] = [
  { itemId: 'a', installed: true },
  { itemId: 'b', installed: false },
];

describe('<ItemList>', () => {
  it('renders both groups and an installed badge', () => {
    const { lastFrame } = render(
      <ItemList items={items} states={states} selected={new Set(['a'])} cursor={0} />
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Tools');
    expect(out).toContain('Plugins');
    expect(out).toContain('A-tool');
    expect(out).toContain('B-plug');
    expect(out).toContain('installed');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/ui/ItemList.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/ui/ItemList.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { CatalogItem, InstallState } from '../types.js';

export interface ItemListProps {
  items: CatalogItem[];
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
}

export function ItemList({ items, states, selected, cursor }: ItemListProps): JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const tools = items.filter((i) => i.kind === 'tool');
  const plugins = items.filter((i) => i.kind === 'plugin');
  let idx = -1;

  const renderItem = (it: CatalogItem) => {
    idx++;
    const isCursor = idx === cursor;
    const isSelected = selected.has(it.id);
    const installed = byId.get(it.id)?.installed;
    const checkbox = isSelected || installed ? '[✓]' : '[ ]';
    const badge = installed ? ' ✓ installed' : '';
    return (
      <Text key={it.id} color={isCursor ? 'cyan' : undefined}>
        {isCursor ? '> ' : '  '}{checkbox} {it.name.padEnd(20)} {it.description}{badge}
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      <Text bold>Tools</Text>
      {tools.map(renderItem)}
      <Box marginTop={1}><Text bold>Plugins</Text></Box>
      {plugins.map(renderItem)}
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · space toggle · enter continue · q quit</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/ui/ItemList.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ItemList.tsx tests/ui/ItemList.test.tsx
git commit -m "feat(ui): add ItemList checkbox component"
```

---

## Task 12: PluginScopePrompt Ink component

**Files:**
- Create: `src/ui/PluginScopePrompt.tsx`, `tests/ui/PluginScopePrompt.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { PluginScopePrompt } from '../../src/ui/PluginScopePrompt.js';

describe('<PluginScopePrompt>', () => {
  it('renders both options and highlights cursor', () => {
    const { lastFrame } = render(
      <PluginScopePrompt cursor={0} hasRepo={true} />
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Globally');
    expect(out).toContain('This project only');
  });

  it('hides project option when no repo', () => {
    const { lastFrame } = render(
      <PluginScopePrompt cursor={0} hasRepo={false} />
    );
    expect(lastFrame() ?? '').not.toContain('This project only');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/ui/PluginScopePrompt.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/ui/PluginScopePrompt.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface PluginScopePromptProps {
  cursor: 0 | 1;
  hasRepo: boolean;
}

export function PluginScopePrompt({ cursor, hasRepo }: PluginScopePromptProps): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>How should plugins be installed?</Text>
      <Text color={cursor === 0 ? 'cyan' : undefined}>
        {cursor === 0 ? '◉' : '○'} Globally (~/.claude — applies to all projects)
      </Text>
      {hasRepo && (
        <Text color={cursor === 1 ? 'cyan' : undefined}>
          {cursor === 1 ? '◉' : '○'} This project only (.claude in repo root)
        </Text>
      )}
      <Box marginTop={1}><Text dimColor>↑↓ navigate · enter confirm</Text></Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/ui/PluginScopePrompt.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PluginScopePrompt.tsx tests/ui/PluginScopePrompt.test.tsx
git commit -m "feat(ui): add PluginScopePrompt"
```

---

## Task 13: ConfirmSummary, ProgressLog, PostInstallPanel components

**Files:**
- Create: `src/ui/ConfirmSummary.tsx`, `src/ui/ProgressLog.tsx`, `src/ui/PostInstallPanel.tsx`, plus a single combined test file `tests/ui/panels.test.tsx`.

- [ ] **Step 1: Write failing test `tests/ui/panels.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfirmSummary } from '../../src/ui/ConfirmSummary.js';
import { ProgressLog } from '../../src/ui/ProgressLog.js';
import { PostInstallPanel } from '../../src/ui/PostInstallPanel.js';
import type { EngineEvent } from '../../src/types.js';

describe('<ConfirmSummary>', () => {
  it('lists action lines', () => {
    const { lastFrame } = render(
      <ConfirmSummary lines={['Install rtk', 'Install superpowers (global)']} />
    );
    expect(lastFrame()).toContain('Install rtk');
    expect(lastFrame()).toContain('Install superpowers (global)');
  });
});

describe('<ProgressLog>', () => {
  it('renders one line per item-start with status', () => {
    const events: EngineEvent[] = [
      { type: 'item-start', itemId: 'a', label: 'A', index: 1, total: 2 },
      { type: 'item-success', itemId: 'a' },
      { type: 'item-start', itemId: 'b', label: 'B', index: 2, total: 2 },
    ];
    const { lastFrame } = render(<ProgressLog events={events} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out).toContain('✓');
  });
});

describe('<PostInstallPanel>', () => {
  it('shows claude-prompt actions and a done message', () => {
    const events: EngineEvent[] = [
      { type: 'post-prompt', itemId: 'csu', label: 'Trigger automation recommender',
        value: 'Ask Claude: recommend automations for this project' },
      { type: 'done' },
    ];
    const { lastFrame } = render(<PostInstallPanel events={events} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('Done');
    expect(out).toContain('recommend automations');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/ui/panels.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/ui/ConfirmSummary.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export function ConfirmSummary({ lines }: { lines: string[] }): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>The following actions will run:</Text>
      {lines.map((l, i) => <Text key={i}>  • {l}</Text>)}
      <Box marginTop={1}><Text dimColor>enter to install · q to abort</Text></Box>
    </Box>
  );
}
```

- [ ] **Step 4: Create `src/ui/ProgressLog.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { EngineEvent } from '../types.js';

interface Line { id: string; label: string; status: 'running' | 'ok' | 'fail'; index: number; total: number; isPost?: boolean }

function reduce(events: EngineEvent[]): Line[] {
  const lines: Line[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'item-start':
        lines.push({ id: e.itemId, label: e.label, status: 'running', index: e.index, total: e.total });
        break;
      case 'item-success': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && !l.isPost);
        if (last) last.status = 'ok';
        break;
      }
      case 'item-failure': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && !l.isPost);
        if (last) last.status = 'fail';
        break;
      }
      case 'post-shell-start':
        lines.push({ id: e.itemId, label: '↳ ' + e.label, status: 'running', index: 0, total: 0, isPost: true });
        break;
      case 'post-shell-success': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && l.isPost);
        if (last) last.status = 'ok';
        break;
      }
      case 'post-shell-failure': {
        const last = [...lines].reverse().find((l) => l.id === e.itemId && l.isPost);
        if (last) last.status = 'fail';
        break;
      }
    }
  }
  return lines;
}

export function ProgressLog({ events }: { events: EngineEvent[] }): JSX.Element {
  const lines = reduce(events);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => {
        const sym = l.status === 'ok' ? '✓' : l.status === 'fail' ? '✗' : '·';
        const prefix = l.isPost ? '    ' : `[${l.index}/${l.total}] `;
        return <Text key={i} color={l.status === 'fail' ? 'red' : undefined}>{prefix}{l.label} {sym}</Text>;
      })}
    </Box>
  );
}
```

- [ ] **Step 5: Create `src/ui/PostInstallPanel.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { EngineEvent } from '../types.js';

export function PostInstallPanel({ events }: { events: EngineEvent[] }): JSX.Element {
  const prompts = events.filter((e): e is Extract<EngineEvent, { type: 'post-prompt' }> => e.type === 'post-prompt');
  const done = events.some((e) => e.type === 'done');
  return (
    <Box flexDirection="column">
      <Text bold color="green">{done ? '✓ Done!' : ''}</Text>
      {prompts.length > 0 && <Text>Next steps:</Text>}
      {prompts.map((p, i) => (
        <Box key={i} flexDirection="column" marginLeft={2} marginTop={1}>
          <Text>• <Text bold>{p.label}</Text></Text>
          <Text dimColor>    {p.value}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 6: Run, expect pass**

Run: `npm test -- tests/ui/panels.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ConfirmSummary.tsx src/ui/ProgressLog.tsx src/ui/PostInstallPanel.tsx tests/ui/panels.test.tsx
git commit -m "feat(ui): add ConfirmSummary, ProgressLog, PostInstallPanel"
```

---

## Task 14: App orchestrator (state machine)

**Files:**
- Create: `src/ui/App.tsx`, `tests/ui/App.test.tsx`

The App owns wizard state (`screen` enum), keyboard input via `useInput`, and dispatches engine work via a callback prop. UI tested with `ink-testing-library` keyboard injection.

- [ ] **Step 1: Write failing test `tests/ui/App.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/ui/App.js';
import type { Catalog, EngineEvent, InstallPlan, InstallState } from '../../src/types.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };

const catalog = bundled as Catalog;
const states: InstallState[] = catalog.items.map((i) => ({ itemId: i.id, installed: false }));

describe('<App>', () => {
  it('starts on the selection screen and exits on q', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog} initialStates={states} repoRoot={null}
        runInstall={async () => {}} onComplete={onComplete}
      />
    );
    expect(lastFrame()).toContain('Tools');
    stdin.write('q');
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).toHaveBeenCalledWith({ aborted: true });
  });

  it('selecting an item, then enter, advances to scope prompt when plugin selected', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog} initialStates={states} repoRoot={'/repo'}
        runInstall={async () => {}} onComplete={onComplete}
      />
    );
    // Cursor at 0 (claude-mem). Move down to a plugin then toggle. Order: tools first.
    // Easiest: navigate to bottom (3 down arrows), space, enter.
    stdin.write('[B'); // ↓
    stdin.write('[B');
    stdin.write('[B');
    stdin.write(' '); // toggle (last item, a plugin)
    stdin.write('\r'); // enter
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('How should plugins be installed?');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/ui/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/ui/App.tsx`**

```tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { Catalog, CatalogItem, EngineEvent, InstallPlan, InstallState, Scope } from '../types.js';
import { ItemList } from './ItemList.js';
import { PluginScopePrompt } from './PluginScopePrompt.js';
import { ConfirmSummary } from './ConfirmSummary.js';
import { ProgressLog } from './ProgressLog.js';
import { PostInstallPanel } from './PostInstallPanel.js';
import { orderForInstall } from '../engine/ordering.js';

type Screen = 'select' | 'scope' | 'confirm' | 'run' | 'done';

export interface AppProps {
  catalog: Catalog;
  initialStates: InstallState[];
  repoRoot: string | null;
  runInstall: (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => Promise<void>;
  onComplete: (r: { aborted?: boolean; error?: string }) => void;
}

export function App({ catalog, initialStates, repoRoot, runInstall, onComplete }: AppProps): JSX.Element {
  const { exit } = useApp();
  const items = catalog.items;
  const orderedForUI = useMemo(() =>
    [...items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'tool' ? -1 : 1)),
    [items]);

  const installedIds = new Set(initialStates.filter((s) => s.installed).map((s) => s.itemId));
  const [selected, setSelected] = useState<Set<string>>(new Set(installedIds));
  const [cursor, setCursor] = useState(0);
  const [screen, setScreen] = useState<Screen>('select');
  const [scopeCursor, setScopeCursor] = useState<0 | 1>(0);
  const [pluginScope, setPluginScope] = useState<Scope>('global');
  const [events, setEvents] = useState<EngineEvent[]>([]);

  const newSelected = [...selected].filter((id) => !installedIds.has(id));
  const hasPlugin = newSelected.some((id) => items.find((i) => i.id === id)?.kind === 'plugin');

  useInput((input, key) => {
    if (input === 'q' && screen !== 'run') {
      onComplete({ aborted: true });
      exit();
      return;
    }
    if (screen === 'select') {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(orderedForUI.length - 1, c + 1));
      else if (input === ' ') {
        const it = orderedForUI[cursor]!;
        if (installedIds.has(it.id)) return; // locked
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
          return next;
        });
      } else if (key.return) {
        if (newSelected.length === 0) { onComplete({}); exit(); return; }
        if (hasPlugin && repoRoot) setScreen('scope');
        else setScreen('confirm');
      }
    } else if (screen === 'scope') {
      if (key.upArrow) setScopeCursor(0);
      else if (key.downArrow) setScopeCursor(1);
      else if (key.return) {
        setPluginScope(scopeCursor === 0 ? 'global' : 'project');
        setScreen('confirm');
      }
    } else if (screen === 'confirm') {
      if (key.return) {
        setScreen('run');
        const plan: InstallPlan = {
          selected: newSelected.map((id) => items.find((i) => i.id === id)!),
          pluginScope,
          repoRoot,
        };
        runInstall(plan, (e) => setEvents((evs) => [...evs, e]))
          .then(() => { setScreen('done'); })
          .catch((err) => { setScreen('done'); onComplete({ error: String(err) }); });
      }
    } else if (screen === 'done') {
      if (key.return) { onComplete({}); exit(); }
    }
  });

  if (screen === 'select') {
    return <ItemList items={orderedForUI} states={initialStates} selected={selected} cursor={cursor} />;
  }
  if (screen === 'scope') {
    return <PluginScopePrompt cursor={scopeCursor} hasRepo={!!repoRoot} />;
  }
  if (screen === 'confirm') {
    const ordered = orderForInstall(newSelected.map((id) => items.find((i) => i.id === id)!));
    const lines = ordered.map((it) => {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      return `Install ${it.name}${scope}`;
    });
    return <ConfirmSummary lines={lines} />;
  }
  if (screen === 'run') {
    return <ProgressLog events={events} />;
  }
  return (
    <Box flexDirection="column">
      <ProgressLog events={events} />
      <Box marginTop={1}><PostInstallPanel events={events} /></Box>
      <Box marginTop={1}><Text dimColor>enter to exit</Text></Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/ui/App.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx tests/ui/App.test.tsx
git commit -m "feat(ui): add App orchestrator with screen state machine"
```

---

## Task 15: install command (wires App + engine)

**Files:**
- Create: `src/commands/install.ts`

This is plumbing only — no new logic. No unit test (App and executor already tested); covered by manual smoke + E2E in Task 19.

- [ ] **Step 1: Create `src/commands/install.ts`**

```ts
import React from 'react';
import { render } from 'ink';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import { executeInstall } from '../engine/executor.js';
import { App } from '../ui/App.js';
import { execa } from 'execa';
import type { EngineEvent, InstallPlan } from '../types.js';

export async function runInstall(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const initialStates = await detectStates(catalog.items);
  const repoRoot = await findRepoRoot();

  const runInstallEngine = async (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => {
    await executeInstall(plan, {
      run: async (cmd, options) => {
        const r = await execa(cmd, { shell: true, reject: false, cwd: options?.cwd });
        return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
      },
      onEvent,
      dryRun: false,
    });
  };

  await new Promise<void>((resolve) => {
    const app = render(
      <App
        catalog={catalog}
        initialStates={initialStates}
        repoRoot={repoRoot}
        runInstall={runInstallEngine}
        onComplete={() => { app.unmount(); resolve(); }}
      />
    );
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/commands/install.ts
git commit -m "feat(cmd): wire install command to App + executor"
```

---

## Task 16: remove command

**Files:**
- Create: `src/commands/remove.ts`, `tests/commands/remove.test.ts`

Remove is non-Ink: it lists installed items, confirms via simple stdin (or `--yes` flag), then runs `uninstall` commands sequentially. Keeps surface small.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { planUninstall } from '../../src/commands/remove.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'a', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' },
    uninstall: { command: 'rm a' } },
  { id: 'b', name: 'b', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no uninstall
];
const states: InstallState[] = [
  { itemId: 'a', installed: true }, { itemId: 'b', installed: true },
];

describe('planUninstall', () => {
  it('returns only items that are installed AND have an uninstall command', () => {
    const out = planUninstall(items, states);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/commands/remove.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/commands/remove.ts`**

```ts
import { execa } from 'execa';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import type { CatalogItem, InstallState } from '../types.js';

export function planUninstall(items: CatalogItem[], states: InstallState[]): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items.filter((i) => installed.has(i.id) && i.uninstall);
}

export async function runRemove(opts: { yes?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const states = await detectStates(catalog.items);
  const targets = planUninstall(catalog.items, states);
  if (targets.length === 0) {
    console.log('Nothing to uninstall.');
    return;
  }
  console.log('The following items will be uninstalled:');
  for (const t of targets) console.log(`  - ${t.name}`);
  if (!opts.yes) {
    console.log('\nRe-run with --yes to confirm.');
    return;
  }
  for (const t of targets) {
    process.stdout.write(`Uninstalling ${t.name} ... `);
    const r = await execa(t.uninstall!.command, { shell: true, reject: false });
    if (r.exitCode === 0) console.log('✓');
    else { console.log(`✗ (exit ${r.exitCode})`); process.exit(1); }
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/commands/remove.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/commands/remove.ts tests/commands/remove.test.ts
git commit -m "feat(cmd): add remove command with --yes confirmation"
```

---

## Task 17: update command

**Files:**
- Create: `src/commands/update.ts`, `tests/commands/update.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { planUpdate } from '../../src/commands/update.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'a', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, update: { command: 'up a' } },
  { id: 'b', name: 'b', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no update
  { id: 'c', name: 'c', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, update: { command: 'up c' } },
];
const states: InstallState[] = [
  { itemId: 'a', installed: true },
  { itemId: 'b', installed: true },
  { itemId: 'c', installed: false },
];

describe('planUpdate', () => {
  it('includes installed items with update command', () => {
    expect(planUpdate(items, states).map((i) => i.id)).toEqual(['a']);
  });
  it('--only filter narrows further', () => {
    expect(planUpdate(items, states, 'a').map((i) => i.id)).toEqual(['a']);
    expect(planUpdate(items, states, 'c').map((i) => i.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- tests/commands/update.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/commands/update.ts`**

```ts
import { execa } from 'execa';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import type { CatalogItem, InstallState } from '../types.js';

export function planUpdate(items: CatalogItem[], states: InstallState[], only?: string): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items
    .filter((i) => installed.has(i.id) && i.update)
    .filter((i) => !only || i.id === only);
}

export async function runUpdate(opts: { only?: string } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const states = await detectStates(catalog.items);
  const targets = planUpdate(catalog.items, states, opts.only);
  if (targets.length === 0) { console.log('Nothing to update.'); return; }
  for (const t of targets) {
    process.stdout.write(`Updating ${t.name} ... `);
    const r = await execa(t.update!.command, { shell: true, reject: false });
    if (r.exitCode === 0) console.log('✓');
    else { console.log(`✗ (exit ${r.exitCode})`); process.exit(1); }
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/commands/update.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/update.ts tests/commands/update.test.ts
git commit -m "feat(cmd): add update command with --only flag"
```

---

## Task 18: CLI entrypoint (commander)

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Replace `src/cli.ts` with full entry**

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
  .option('--refresh-catalog', 'force re-fetch catalog, ignore cache')
  .action(async (opts) => { await runInstall({ refreshCatalog: !!opts.refreshCatalog }); });

program.command('status')
  .description('Show installed/missing state for each item')
  .option('--refresh-catalog', 'force re-fetch catalog')
  .action(async (opts) => { await runStatus({ refreshCatalog: !!opts.refreshCatalog }); });

program.command('remove')
  .description('Uninstall installed items')
  .option('--yes', 'skip confirmation')
  .action(async (opts) => { await runRemove({ yes: !!opts.yes }); });

program.command('update')
  .description('Update installed items')
  .option('--only <id>', 'update only the given item')
  .action(async (opts) => { await runUpdate({ only: opts.only }); });

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
```

- [ ] **Step 2: Build & smoke test**

Run: `npm run build && node dist/cli.js --help`
Expected: Help text listing `status`, `remove`, `update` commands.

Run: `node dist/cli.js status`
Expected: Loads catalog, prints a status table for the 4 items (most likely all "missing" on a fresh machine).

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): wire commander with install/status/remove/update"
```

---

## Task 19: End-to-end dry-run test

**Files:**
- Create: `tests/e2e/install-dryrun.test.ts`

Verifies the canonical "all 4 items, project scope" command sequence as a fixture. Catches regressions in ordering/wiring.

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };
import type { Catalog, InstallPlan } from '../../src/types.js';

describe('e2e: install dry-run for all 4 items, project scope', () => {
  it('records expected command sequence', async () => {
    const cat = bundled as Catalog;
    const plan: InstallPlan = {
      selected: cat.items,
      pluginScope: 'project',
      repoRoot: '/repo',
    };
    const recorded: string[] = [];
    await executeInstall(plan, {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      onEvent: () => {},
      dryRun: true,
      record: (c) => recorded.push(c),
    });

    // Order: globals → repo-aware tools → plugins, post-install interleaved.
    expect(recorded).toEqual([
      'npm install -g @thedotmack/claude-mem',           // claude-mem (global tool)
      'npm install -g @rtk-ai/rtk',                       // rtk (repo-aware tool)
      'rtk init -g',                                      // rtk post-install
      'claude plugin install superpowers@claude-plugins-official',
      'claude plugin install claude-code-setup@claude-plugins-official',
      // claude-code-setup post-install is a claude-prompt, not a shell — not recorded.
    ]);
  });
});
```

> If you updated `bundled.json` in Task 4 with different install commands, update the expected array here to match.

- [ ] **Step 2: Run, expect pass**

Run: `npm test -- tests/e2e/install-dryrun.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/install-dryrun.test.ts
git commit -m "test(e2e): assert canonical install command sequence"
```

---

## Task 20: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# auto-claude

Curated installer and lifecycle manager for Claude Code tools and plugins.

## Quick start

```bash
npx auto-claude
```

Pick the tools and plugins you want from the checklist; auto-claude installs them in the right order, runs any required post-install steps, and prints any final instructions you need to give to Claude itself.

## Commands

| Command | What it does |
|---|---|
| `npx auto-claude` | Interactive install wizard (default) |
| `npx auto-claude status` | Show installed/missing state |
| `npx auto-claude remove [--yes]` | Uninstall installed items |
| `npx auto-claude update [--only <id>]` | Update installed items |
| `npx auto-claude --refresh-catalog` | Bypass the 24h catalog cache |

## What it installs

The catalog is fetched at runtime; the bundled fallback ships with these:

- **claude-mem** — persistent cross-session memory
- **rtk** — token-optimized CLI proxy (also runs `rtk init -g` in the repo)
- **superpowers** — Claude Code skills framework plugin
- **claude-code-setup** — automation recommender plugin

## Requirements

- Node.js 20+
- `claude` CLI (for plugin install)
- `git` (for project-scoped operations)
```

- [ ] **Step 2: Final verification**

Run all checks:
```bash
npm run typecheck && npm test && npm run build && node dist/cli.js status
```
Expected: typecheck clean, all tests pass, status command runs and prints a table.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: replace README with usage guide"
```

---

## Self-Review

**Spec coverage:**
- §2 Goals — all covered: one-command bootstrap (Task 15+18), detection (Task 7), automated post-install (Task 9), claude-prompt surfacing (Task 13 PostInstallPanel), global+project plugin scope (Tasks 9, 14), remote catalog with fallback (Task 5).
- §4 User Flow — Task 14 App owns the full state machine.
- §5 Architecture — file structure mirrors spec exactly.
- §6 Catalog Schema — Tasks 2, 3.
- §6.1 Initial Catalog — Task 4.
- §7 Catalog Loading — Task 5 covers all four fallback layers + 5s timeout via `defaultDeps`.
- §8 Subcommands — Tasks 10 (status), 16 (remove), 17 (update), 18 (cli wiring `--refresh-catalog`).
- §9 Execution Engine — Task 9 (ordering, post-install sequencing, halt on failure, repo-root cwd).
- §10 Error Handling — stderr tail in executor (Task 9), schema fallback in loader (Task 5), repo-aware skip (Task 9 + App in Task 14).
- §11 Testing — unit tests in every engine/catalog task; ink-testing-library in UI tasks; E2E dry-run in Task 19.
- §12 Distribution — Task 1 sets up `bin`, `tsup`, ESM. Task 20 README finalizes UX docs.
- §14 Open Items — Task 4 explicitly verifies rtk install command and `claude plugin` syntax against live docs.

**Type consistency check:** `CatalogItem`, `EngineEvent`, `InstallPlan`, `InstallState`, `Scope`, `ItemKind`, `PostInstallAction` — all defined once in Task 2's `types.ts` and imported consistently. `RichRunner`, `ShellRunner`, `Runner` — three separate runner types but each has a single use site (executor, detect, project respectively); intentional since they have different signatures.

**No placeholders:** every code-step contains real code; the only `<owner>` placeholder is the GitHub URL in `loader.ts` which is acknowledged in the spec as needing finalization at first publish (Task 5 leaves `REMOTE_URL` editable; updating it does not block any other task).

**Open assumptions to validate during execution:**
1. rtk install command (Task 4 Step 2 explicitly verifies).
2. `claude plugin` project-scope mechanism (Task 4 Step 2 explicitly verifies — may require switching from cwd-based to a flag).

If validation in Task 4 reveals a different rtk install command, also update the assertion in Task 19's E2E test.
