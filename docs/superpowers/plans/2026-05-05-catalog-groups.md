# Catalog Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the auto-claude catalog from a flat `items[]` to a grouped model (`groups[].items[]`) with `pick-one` (radio) and `pick-many` (checkbox) semantics, auto-swap for conflicting items, an out-of-band conflict screen, and add MemPalace as a new memory backend.

**Architecture:** v1→v2 hard cutover of the catalog. Types add `CatalogGroup`; schema validates uniqueness + at-most-one-default-per-pick-one-group. `App.tsx` adds a `conflict` screen between detection and `select`. `ItemList.tsx` renders per-group with radio glyph for pick-one. Auto-swap is computed at confirm time using a group lookup map and added to the existing `InstallPlan.uninstall`. Status / default-list commands render grouped output.

**Tech Stack:** TypeScript ESM, Zod, Ink 5 + React 18, Vitest, ink-testing-library.

**Spec:** `docs/superpowers/specs/2026-05-05-catalog-groups-design.md`

---

## File Map

**Types & schema:**
- Modify: `src/types.ts` — add `GroupKind`, `CatalogGroup`; update `Catalog` to `version: 2` + `groups: CatalogGroup[]`.
- Modify: `src/catalog/schema.ts` — add `CatalogGroupSchema`, replace top-level `items` with `groups`, add `.superRefine` invariants.

**Catalog data:**
- Modify: `catalog.json` — rewrite to v2 with groups.
- Create: `src/catalog/bundled.json` — same content as `catalog.json` (offline fallback).

**Loader:**
- Modify: `src/catalog/loader.ts` — import from `bundled.json`, add `flattenItems()` helper, build `Map<itemId, CatalogGroup>` lookup.
- Create: `src/catalog/groups.ts` — small module exposing `flattenItems(catalog)` and `groupByItemId(catalog)`.

**Engine:**
- Modify: `src/commands/status.ts` — render grouped output.
- Modify: `src/commands/default.ts` — render grouped `--list` output.
- Modify: `src/commands/remove.ts`, `src/commands/update.ts` — switch from `catalog.items` to `flattenItems(catalog)`.
- Modify: `src/commands/install.tsx` — pass catalog through (already does); just adapt detect call.

**UI:**
- Modify: `src/ui/ItemList.tsx` — render per-group with header, radio glyphs for pick-one.
- Create: `src/ui/ConflictPrompt.tsx` — new screen for out-of-band conflict resolution.
- Modify: `src/ui/App.tsx` — new `conflict` screen state, pick-one selection logic, auto-swap on confirm.

**Tests (created/modified):**
- Modify: `tests/catalog/schema.test.ts` — invariants.
- Modify: `tests/catalog/loader.test.ts` — group lookup.
- Modify: `tests/catalog/catalog-json.test.ts` — validate the new v2 catalog.json.
- Create: `tests/catalog/groups.test.ts` — flattenItems / groupByItemId helpers.
- Modify: `tests/ui/ItemList.test.tsx` — group headers, radio rendering.
- Modify: `tests/ui/App.test.tsx` — pick-one selection, auto-swap appears in plan.
- Create: `tests/ui/ConflictPrompt.test.tsx` — render + resolve.
- Create: `tests/commands/status.test.ts` — grouped output snapshot.
- Create: `tests/e2e/swap-memory.test.ts` — happy-path memory swap.

---

## Phase 1: Types & schema foundation

### Task 1.1: Add group types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Edit `src/types.ts`** — add `GroupKind`, `CatalogGroup`, change `Catalog`.

Replace the existing `Catalog` interface block (lines 41–45) with:

```ts
export type GroupKind = 'pick-one' | 'pick-many';

export interface CatalogGroup {
  id: string;
  name: string;
  description?: string;
  kind: GroupKind;
  items: CatalogItem[];
}

export interface Catalog {
  version: 2;
  updatedAt: string;
  groups: CatalogGroup[];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: many errors elsewhere referencing `catalog.items`. That's fine — they will be fixed in later tasks. Confirm the errors are about `items` not existing on `Catalog`, not about the new types themselves.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add CatalogGroup and bump Catalog to v2"
```

### Task 1.2: Update Zod schema with invariants

**Files:**
- Modify: `src/catalog/schema.ts`
- Modify: `tests/catalog/schema.test.ts`

- [ ] **Step 1: Write failing tests** in `tests/catalog/schema.test.ts`

Replace the existing test file with:

```ts
import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '../../src/catalog/schema.js';

const baseItem = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: 'x',
  kind: 'tool',
  defaultScope: 'global',
  detect: { command: 'true' },
  install: { command: 'true' },
  ...extra,
});

const validCatalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    { id: 'g1', name: 'G1', kind: 'pick-many', items: [baseItem('a'), baseItem('b')] },
    { id: 'g2', name: 'G2', kind: 'pick-one', items: [baseItem('c', { default: true }), baseItem('d')] },
  ],
};

describe('CatalogSchema v2', () => {
  it('accepts a valid v2 catalog', () => {
    expect(() => CatalogSchema.parse(validCatalog)).not.toThrow();
  });

  it('rejects v1 (no groups)', () => {
    const v1 = { version: 1, updatedAt: '2026-05-05', items: [baseItem('a')] };
    expect(() => CatalogSchema.parse(v1)).toThrow();
  });

  it('rejects duplicate item ids across groups', () => {
    const bad = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'g1', name: 'G1', kind: 'pick-many', items: [baseItem('dup')] },
        { id: 'g2', name: 'G2', kind: 'pick-many', items: [baseItem('dup')] },
      ],
    };
    expect(() => CatalogSchema.parse(bad)).toThrow(/duplicate item id/i);
  });

  it('rejects duplicate group ids', () => {
    const bad = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'same', name: 'A', kind: 'pick-many', items: [baseItem('a')] },
        { id: 'same', name: 'B', kind: 'pick-many', items: [baseItem('b')] },
      ],
    };
    expect(() => CatalogSchema.parse(bad)).toThrow(/duplicate group id/i);
  });

  it('rejects multiple default:true in a pick-one group', () => {
    const bad = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'g1', name: 'G1', kind: 'pick-one', items: [
          baseItem('a', { default: true }),
          baseItem('b', { default: true }),
        ] },
      ],
    };
    expect(() => CatalogSchema.parse(bad)).toThrow(/at most one default/i);
  });

  it('allows multiple default:true in a pick-many group', () => {
    const ok = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        { id: 'g1', name: 'G1', kind: 'pick-many', items: [
          baseItem('a', { default: true }),
          baseItem('b', { default: true }),
        ] },
      ],
    };
    expect(() => CatalogSchema.parse(ok)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

Run: `pnpm test schema`
Expected: All new tests fail (schema still v1).

- [ ] **Step 3: Update `src/catalog/schema.ts`** to v2 with invariants

Replace the file content with:

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
  interactive: z.boolean().optional(),
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
  default: z.boolean().optional(),
});

export const CatalogGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  kind: z.enum(['pick-one', 'pick-many']),
  items: z.array(CatalogItemSchema).min(1),
});

export const CatalogSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string(),
  groups: z.array(CatalogGroupSchema).min(1),
}).superRefine((cat, ctx) => {
  const seenGroups = new Set<string>();
  const seenItems = new Set<string>();
  for (const group of cat.groups) {
    if (seenGroups.has(group.id)) {
      ctx.addIssue({ code: 'custom', message: `duplicate group id: ${group.id}` });
    }
    seenGroups.add(group.id);

    let defaultCount = 0;
    for (const item of group.items) {
      if (seenItems.has(item.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate item id: ${item.id}` });
      }
      seenItems.add(item.id);
      if (item.default) defaultCount++;
    }
    if (group.kind === 'pick-one' && defaultCount > 1) {
      ctx.addIssue({ code: 'custom', message: `at most one default:true allowed in pick-one group "${group.id}"` });
    }
  }
});
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm test schema`
Expected: All schema tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/schema.ts tests/catalog/schema.test.ts
git commit -m "feat(catalog): v2 schema with group invariants"
```

---

## Phase 2: Catalog data migration

### Task 2.1: Rewrite `catalog.json` to v2 with groups + add MemPalace

**Files:**
- Modify: `catalog.json`

- [ ] **Step 1: Replace `catalog.json` with v2 grouped content**

```json
{
  "version": 2,
  "updatedAt": "2026-05-05",
  "groups": [
    {
      "id": "memory",
      "name": "Memory backend",
      "description": "Persistent cross-session memory. Pick one — running two memory backends doubles writes and recall.",
      "kind": "pick-one",
      "items": [
        {
          "id": "claude-mem",
          "name": "claude-mem",
          "description": "Persistent cross-session memory for Claude Code",
          "kind": "plugin",
          "homepage": "https://github.com/thedotmack/claude-mem",
          "defaultScope": "global",
          "default": true,
          "detect": { "command": "claude plugin list", "versionMatch": "claude-mem" },
          "install":   { "command": "claude plugin install claude-mem@thedotmack" },
          "uninstall": { "command": "claude plugin uninstall claude-mem" }
        },
        {
          "id": "mempalace",
          "name": "MemPalace",
          "description": "Persistent memory for Claude Code via pip + MCP server",
          "kind": "tool",
          "homepage": "https://github.com/MemPalace/mempalace",
          "defaultScope": "global",
          "detect":    { "command": "mempalace --version" },
          "install":   { "command": "pip install mempalace" },
          "uninstall": { "command": "pip uninstall -y mempalace" },
          "update":    { "command": "pip install --upgrade mempalace" },
          "postInstall": [
            { "type": "shell", "value": "claude mcp add mempalace -- mempalace mcp", "label": "Registering MemPalace MCP server" }
          ]
        }
      ]
    },
    {
      "id": "spec",
      "name": "Spec-driven workflow",
      "description": "Spec → plan → implement slash-commands. Pick one workflow.",
      "kind": "pick-one",
      "items": [
        {
          "id": "spec-kit",
          "name": "spec-kit",
          "description": "GitHub's Spec-Driven Development toolkit — /speckit.* slash commands for spec → plan → tasks → implement",
          "kind": "plugin",
          "homepage": "https://github.com/github/spec-kit",
          "defaultScope": "project",
          "detect":    { "command": "specify --version" },
          "install":   { "command": "sh -c 'if ! command -v uv >/dev/null 2>&1; then echo \"Error: uv is required for spec-kit. Install it first with: brew install uv (macOS) — or see https://docs.astral.sh/uv/getting-started/installation/ for other platforms.\" 1>&2; exit 1; fi; uv tool install specify-cli --from git+https://github.com/github/spec-kit.git'" },
          "uninstall": { "command": "uv tool uninstall specify-cli" },
          "update":    { "command": "uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git" },
          "postInstall": [
            { "type": "shell", "value": "specify init . --integration claude --force", "requiresRepo": true, "label": "Initializing spec-kit in repo (Claude integration)" }
          ]
        },
        {
          "id": "open-spec",
          "name": "OpenSpec",
          "description": "Spec-driven development framework — /opsx:* slash commands for proposal → apply → archive",
          "kind": "plugin",
          "homepage": "https://github.com/Fission-AI/OpenSpec",
          "defaultScope": "project",
          "detect":    { "command": "openspec --version" },
          "install":   { "command": "npm install -g @fission-ai/openspec@latest" },
          "uninstall": { "command": "npm uninstall -g @fission-ai/openspec" },
          "update":    { "command": "npm install -g @fission-ai/openspec@latest" },
          "postInstall": [
            { "type": "shell", "value": "openspec init", "requiresRepo": true, "label": "Initializing OpenSpec in repo" }
          ]
        }
      ]
    },
    {
      "id": "code-intelligence",
      "name": "Code intelligence / KG",
      "description": "Knowledge-graph engine over your codebase. Pick one — they overlap.",
      "kind": "pick-one",
      "items": [
        {
          "id": "gitnexus",
          "name": "gitnexus",
          "description": "Code intelligence engine — indexes your repo into a knowledge graph and exposes it via MCP",
          "kind": "tool",
          "homepage": "https://github.com/abhigyanpatwari/GitNexus",
          "defaultScope": "project",
          "default": true,
          "detect": { "command": "gitnexus --version" },
          "install":   { "command": "npm install -g gitnexus" },
          "uninstall": { "command": "npm uninstall -g gitnexus" },
          "update":    { "command": "npm install -g gitnexus@latest" },
          "postInstall": [
            { "type": "shell", "value": "claude mcp add gitnexus -- npx -y gitnexus@latest mcp", "label": "Registering gitnexus MCP server" },
            { "type": "shell", "value": "npx gitnexus analyze", "requiresRepo": true, "label": "Indexing repo into knowledge graph" }
          ]
        },
        {
          "id": "graphify",
          "name": "graphify",
          "description": "Knowledge-graph builder for your codebase, surfaced via the /graphify slash command",
          "kind": "tool",
          "homepage": "https://github.com/safishamsi/graphify",
          "defaultScope": "global",
          "detect": { "command": "graphify --version" },
          "install":   { "command": "pip install graphifyy && graphify install" },
          "postInstall": [
            { "type": "shell", "value": "graphify hook install", "requiresRepo": true, "label": "Installing graphify git hook" }
          ]
        }
      ]
    },
    {
      "id": "docs",
      "name": "Documentation providers",
      "description": "Documentation lookup MCPs. Independent — install any combination.",
      "kind": "pick-many",
      "items": [
        {
          "id": "context7",
          "name": "context7",
          "description": "Upstash Context7 — version-specific library docs and examples pulled into LLM context",
          "kind": "plugin",
          "defaultScope": "global",
          "default": false,
          "detect": { "command": "claude plugin list", "versionMatch": "context7" },
          "install":   { "command": "claude plugin install context7@claude-plugins-official" },
          "uninstall": { "command": "claude plugin uninstall context7" }
        },
        {
          "id": "microsoft-docs",
          "name": "microsoft-docs",
          "description": "Official Microsoft / Azure / .NET documentation, API references, and code samples",
          "kind": "plugin",
          "defaultScope": "global",
          "default": false,
          "detect": { "command": "claude plugin list", "versionMatch": "microsoft-docs" },
          "install":   { "command": "claude plugin install microsoft-docs@claude-plugins-official" },
          "uninstall": { "command": "claude plugin uninstall microsoft-docs" }
        }
      ]
    },
    {
      "id": "context-optimization",
      "name": "Context & token optimization",
      "kind": "pick-many",
      "items": [
        {
          "id": "rtk",
          "name": "rtk",
          "description": "Rust Token Killer — token-optimized CLI proxy",
          "kind": "tool",
          "homepage": "https://github.com/rtk-ai/rtk",
          "defaultScope": "global",
          "default": true,
          "detect": { "command": "rtk --version" },
          "install":   { "command": "brew install rtk" },
          "uninstall": { "command": "brew uninstall rtk" },
          "update":    { "command": "brew upgrade rtk" },
          "postInstall": [
            { "type": "shell", "value": "rtk init -g", "requiresRepo": true, "label": "Initializing rtk in repo" }
          ]
        },
        {
          "id": "context-mode",
          "name": "context-mode",
          "default": true,
          "description": "MCP server that sandboxes tool output and indexes session events — ~98% context reduction",
          "kind": "tool",
          "homepage": "https://github.com/mksglu/context-mode",
          "defaultScope": "global",
          "detect":    { "command": "context-mode --version" },
          "install":   { "command": "npm install -g context-mode" },
          "uninstall": { "command": "npm uninstall -g context-mode" },
          "update":    { "command": "npm install -g context-mode@latest" },
          "postInstall": [
            { "type": "shell", "value": "claude mcp add context-mode -- npx -y context-mode", "label": "Registering context-mode MCP server" }
          ]
        },
        {
          "id": "codeburn",
          "name": "codeburn",
          "description": "TUI dashboard for AI coding token usage and cost across 18 providers",
          "kind": "tool",
          "homepage": "https://github.com/getagentseal/codeburn",
          "defaultScope": "global",
          "detect":    { "command": "codeburn --version" },
          "install":   { "command": "npm install -g codeburn" },
          "uninstall": { "command": "npm uninstall -g codeburn" },
          "update":    { "command": "npm install -g codeburn@latest" }
        }
      ]
    },
    {
      "id": "core-plugins",
      "name": "Core Claude Code plugins",
      "kind": "pick-many",
      "items": [
        {
          "id": "superpowers",
          "name": "superpowers",
          "description": "Claude Code plugin: skills framework",
          "kind": "plugin",
          "defaultScope": "global",
          "default": true,
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
          "default": true,
          "detect": { "command": "claude plugin list", "versionMatch": "claude-code-setup" },
          "install":   { "command": "claude plugin install claude-code-setup@claude-plugins-official" },
          "uninstall": { "command": "claude plugin uninstall claude-code-setup" },
          "postInstall": [
            { "type": "claude-prompt", "label": "Trigger automation recommender",
              "value": "Ask Claude in this repo: \"recommend automations for this project\"" }
          ]
        },
        {
          "id": "plugin-dev",
          "name": "plugin-dev",
          "description": "Toolkit for developing Claude Code plugins (hooks, MCP, commands, agents, best practices)",
          "kind": "plugin",
          "defaultScope": "global",
          "detect": { "command": "claude plugin list", "versionMatch": "plugin-dev" },
          "install":   { "command": "claude plugin install plugin-dev@claude-plugins-official" },
          "uninstall": { "command": "claude plugin uninstall plugin-dev" }
        }
      ]
    },
    {
      "id": "visual",
      "name": "Visual tooling",
      "kind": "pick-many",
      "items": [
        {
          "id": "snip",
          "name": "Snip",
          "description": "Visual mode for Claude Code — render diagrams, annotate previews, OCR screenshots (macOS via Homebrew cask)",
          "kind": "tool",
          "homepage": "https://github.com/rixinhahaha/snip",
          "defaultScope": "global",
          "default": true,
          "detect":    { "command": "snip --help" },
          "install":   { "command": "brew install --cask rixinhahaha/snip/snip" },
          "uninstall": { "command": "brew uninstall --cask snip" },
          "update":    { "command": "brew upgrade --cask snip" },
          "postInstall": [
            { "type": "shell", "value": "snip setup", "label": "Wiring Snip into Claude Code", "interactive": true }
          ]
        }
      ]
    },
    {
      "id": "project-templates",
      "name": "Project-specific templates",
      "kind": "pick-many",
      "items": [
        {
          "id": "drunk-app",
          "name": "drunk-app",
          "description": "AI assistant for configuring drunk-app Helm chart deployments (values.yaml, validation)",
          "kind": "plugin",
          "homepage": "https://github.com/baoduy/drunk.charts",
          "defaultScope": "project",
          "detect": { "command": "claude plugin list", "versionMatch": "drunk-app" },
          "install":   { "command": "claude plugin marketplace add baoduy/drunk.charts && claude plugin install drunk-app@drunk-charts" },
          "uninstall": { "command": "claude plugin uninstall drunk-app" }
        },
        {
          "id": "dknet-minimal",
          "name": "dknet-minimal",
          "description": "Slash commands, subagents, and skills for vertical-slice features on DKNet.Minimal.Template (.NET 10, DDD/CQRS, EF Core)",
          "kind": "plugin",
          "homepage": "https://github.com/baoduy/DKNet.Templates",
          "defaultScope": "project",
          "detect": { "command": "claude plugin list", "versionMatch": "dknet-minimal" },
          "install":   { "command": "claude plugin marketplace add baoduy/DKNet.Templates && claude plugin install dknet-minimal@dknet-marketplace" },
          "uninstall": { "command": "claude plugin uninstall dknet-minimal" }
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Update `tests/catalog/catalog-json.test.ts`**

Make sure it parses the v2 file. The existing test imports `catalog.json` and validates with `CatalogSchema`; with v2 schema active, it should still pass without changes. Run:

Run: `pnpm test catalog-json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add catalog.json
git commit -m "feat(catalog): migrate to v2 grouped layout, add MemPalace"
```

### Task 2.2: Create `src/catalog/bundled.json` offline fallback

**Files:**
- Create: `src/catalog/bundled.json`
- Modify: `src/catalog/loader.ts` (import path)

- [ ] **Step 1: Copy `catalog.json` to `src/catalog/bundled.json`**

```bash
cp catalog.json src/catalog/bundled.json
```

- [ ] **Step 2: Edit `src/catalog/loader.ts` — change the import path**

Change line 6:
```ts
import bundledJson from '../../catalog.json' with { type: 'json' };
```
to:
```ts
import bundledJson from './bundled.json' with { type: 'json' };
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors related to the bundled import.

- [ ] **Step 4: Commit**

```bash
git add src/catalog/bundled.json src/catalog/loader.ts
git commit -m "feat(catalog): add bundled.json offline fallback"
```

---

## Phase 3: Group helpers

### Task 3.1: `flattenItems` and `groupByItemId`

**Files:**
- Create: `src/catalog/groups.ts`
- Create: `tests/catalog/groups.test.ts`

- [ ] **Step 1: Write failing tests** in `tests/catalog/groups.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { flattenItems, groupByItemId } from '../../src/catalog/groups.js';
import type { Catalog } from '../../src/types.js';

const cat: Catalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    {
      id: 'g1', name: 'G1', kind: 'pick-many', items: [
        { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ],
    },
    {
      id: 'g2', name: 'G2', kind: 'pick-one', items: [
        { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
        { id: 'c', name: 'C', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ],
    },
  ],
};

describe('flattenItems', () => {
  it('returns all items in declared order', () => {
    expect(flattenItems(cat).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('groupByItemId', () => {
  it('maps each item id to its group', () => {
    const m = groupByItemId(cat);
    expect(m.get('a')?.id).toBe('g1');
    expect(m.get('b')?.id).toBe('g2');
    expect(m.get('c')?.id).toBe('g2');
    expect(m.get('zz')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test groups`
Expected: import error / file not found.

- [ ] **Step 3: Create `src/catalog/groups.ts`**

```ts
import type { Catalog, CatalogGroup, CatalogItem } from '../types.js';

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
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test groups`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/groups.ts tests/catalog/groups.test.ts
git commit -m "feat(catalog): add flattenItems and groupByItemId helpers"
```

---

## Phase 4: Wire callers to flattened items

### Task 4.1: Update commands and install entrypoint

**Files:**
- Modify: `src/commands/status.ts`
- Modify: `src/commands/default.ts`
- Modify: `src/commands/remove.ts`
- Modify: `src/commands/update.ts`
- Modify: `src/commands/install.tsx`

- [ ] **Step 1: `src/commands/status.ts`** — replace `catalog.items` with `flattenItems(catalog)`

Add at top:
```ts
import { flattenItems } from '../catalog/groups.js';
```

In `runStatus`, change:
```ts
const states = await detectStates(catalog.items);
process.stdout.write(printHeader('status'));
console.log(renderStatus(catalog.items, states));
```
to:
```ts
const items = flattenItems(catalog);
const states = await detectStates(items);
process.stdout.write(printHeader('status'));
console.log(renderStatus(catalog, states));
```

Change `renderStatus`'s signature — it now takes the full catalog so it can group. (Phase 7 implements grouped rendering. For now keep it functional with a flat signature but use the catalog parameter.)

Replace `renderStatus`:
```ts
export function renderStatus(catalog: import('../types.js').Catalog, states: InstallState[]): string {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  for (const item of flattenItems(catalog)) {
    const s = byId.get(item.id);
    const badge = s?.installed
      ? paint(`${GLYPHS.ok} installed`, 'ok')
      : paint(`${GLYPHS.missing} missing  `, 'dim');
    const kindGlyph = item.kind === 'tool'
      ? paint(GLYPHS.tool, 'tool')
      : paint(GLYPHS.plugin, 'plugin');
    const ver = s?.version ? paint(`  (${s.version})`, 'dim') : '';
    lines.push(`  ${badge}  ${kindGlyph} ${item.kind.padEnd(7)}  ${item.name}${ver}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: `src/commands/default.ts`** — replace `catalog.items.filter(...)` with flattened.

Add:
```ts
import { flattenItems } from '../catalog/groups.js';
```

Change all `catalog.items.filter((i) => i.default === true)` (two occurrences in `runDefaultList` and `runDefault`) to:
```ts
flattenItems(catalog).filter((i) => i.default === true)
```

- [ ] **Step 3: `src/commands/remove.ts` & `src/commands/update.ts`**

Use Grep to confirm any `catalog.items` references and replace with `flattenItems(catalog)` (add the import).

Run: `pnpm exec rg -n "catalog\.items" src/`
Expected: only the loader and any places already updated. Update each.

- [ ] **Step 4: `src/commands/install.tsx`**

Same: replace `catalog.items` with `flattenItems(catalog)` where used to feed detect / App. The `App` component will still receive the full `catalog` (App needs the groups).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean — except for `App.tsx`/`ItemList.tsx` which still reference `catalog.items` and will be fixed in Phase 5.

- [ ] **Step 6: Run full test suite to confirm no regressions yet**

Run: `pnpm test`
Expected: only UI-related tests fail (they reference v1 layout); catalog/schema/loader tests pass. Note which tests fail — they will be fixed in Phase 5/6/7.

- [ ] **Step 7: Commit**

```bash
git add src/commands/
git commit -m "refactor(commands): use flattenItems(catalog) for v2 catalog"
```

---

## Phase 5: UI — render groups & pick-one selection

### Task 5.1: `ItemList` renders per-group with radio glyphs

**Files:**
- Modify: `src/ui/ItemList.tsx`
- Modify: `tests/ui/ItemList.test.tsx`

- [ ] **Step 1: Write failing test** at `tests/ui/ItemList.test.tsx` (replace existing)

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ItemList } from '../../src/ui/ItemList.js';
import type { Catalog } from '../../src/types.js';

const catalog: Catalog = {
  version: 2,
  updatedAt: '2026-05-05',
  groups: [
    {
      id: 'memory', name: 'Memory backend', kind: 'pick-one',
      items: [
        { id: 'a', name: 'A', description: 'item-a', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
        { id: 'b', name: 'B', description: 'item-b', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
      ],
    },
    {
      id: 'docs', name: 'Documentation providers', kind: 'pick-many',
      items: [
        { id: 'c', name: 'C', description: 'item-c', kind: 'plugin', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' } },
      ],
    },
  ],
};

describe('ItemList grouped layout', () => {
  it('shows group headers', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set(['a'])} cursor={0} />
    );
    expect(lastFrame()).toMatch(/Memory backend/);
    expect(lastFrame()).toMatch(/Documentation providers/);
  });

  it('renders pick-one members with radio glyphs', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set(['a'])} cursor={0} />
    );
    // Selected pick-one member shows ◉ ; unselected shows ○ .
    expect(lastFrame()).toMatch(/[◉●]/);
    expect(lastFrame()).toMatch(/[○◯]/);
  });

  it('renders pick-many members with checkbox glyphs', () => {
    const { lastFrame } = render(
      <ItemList catalog={catalog} states={[]} selected={new Set()} cursor={0} />
    );
    // Pick-many uses [ ] / [x]
    expect(lastFrame()).toMatch(/\[ \]/);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test ItemList`
Expected: type error / mismatch (`items` prop renamed).

- [ ] **Step 3: Update `src/ui/theme.ts`** — add radio glyphs

Add to the `GLYPHS` object (find by Read first):

Run: `pnpm exec rg -n "GLYPHS = " src/ui/theme.ts`

Add fields `radioOn: '◉'`, `radioOff: '○'` to the `GLYPHS` const.

- [ ] **Step 4: Replace `src/ui/ItemList.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { Catalog, CatalogGroup, CatalogItem, InstallState } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export interface ItemListProps {
  catalog: Catalog;
  states: InstallState[];
  selected: Set<string>;
  cursor: number;
}

interface RowVisuals {
  glyph: string;
  glyphColor?: string;
  badge: string;
  badgeColor?: string;
  rowColor?: string;
  rowDim?: boolean;
  bracketed: boolean; // [x] vs (◉)
}

function visualsFor(it: CatalogItem, group: CatalogGroup, isSelected: boolean, installed: boolean, isCursor: boolean): RowVisuals {
  const bracketed = group.kind === 'pick-many';
  const onGlyph  = bracketed ? GLYPHS.ok       : GLYPHS.radioOn;
  const offGlyph = bracketed ? ' '             : GLYPHS.radioOff;

  const locked = installed && !it.uninstall;
  if (locked) {
    return {
      glyph: GLYPHS.locked, badge: ` ${GLYPHS.ok} installed (locked — no uninstaller)`,
      rowDim: !isCursor, rowColor: isCursor ? COLORS.cursor : undefined, bracketed,
    };
  }
  if (installed && isSelected) {
    return {
      glyph: onGlyph, glyphColor: COLORS.ok,
      badge: ` ${GLYPHS.ok} installed`, badgeColor: COLORS.ok,
      rowColor: isCursor ? COLORS.cursor : undefined, bracketed,
    };
  }
  if (installed && !isSelected) {
    return {
      glyph: bracketed ? GLYPHS.remove : offGlyph, glyphColor: COLORS.warn,
      badge: ` ${GLYPHS.remove} will uninstall`, badgeColor: COLORS.warn,
      rowColor: isCursor ? COLORS.cursor : COLORS.warn, bracketed,
    };
  }
  if (isSelected) {
    return {
      glyph: bracketed ? GLYPHS.add : onGlyph, glyphColor: COLORS.ok,
      badge: ` ${GLYPHS.add} will install`, badgeColor: COLORS.ok,
      rowColor: isCursor ? COLORS.cursor : undefined, bracketed,
    };
  }
  return { glyph: offGlyph, badge: '', rowColor: isCursor ? COLORS.cursor : undefined, bracketed };
}

export function ItemList({ catalog, states, selected, cursor }: ItemListProps): React.JSX.Element {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  let idx = -1;

  const renderItem = (it: CatalogItem, group: CatalogGroup) => {
    idx++;
    const isCursor = idx === cursor;
    const isSelected = selected.has(it.id);
    const installed = !!byId.get(it.id)?.installed;
    const v = visualsFor(it, group, isSelected, installed, isCursor);
    const cursorGlyph = isCursor ? `${GLYPHS.cursor} ` : '  ';
    const kindGlyph = it.kind === 'tool' ? GLYPHS.tool : GLYPHS.plugin;
    const kindColor = it.kind === 'tool' ? COLORS.tool : COLORS.plugin;
    const open  = v.bracketed ? '[' : '(';
    const close = v.bracketed ? ']' : ')';

    return (
      <Text key={it.id} color={v.rowColor} dimColor={v.rowDim}>
        <Text color={isCursor ? COLORS.cursor : undefined} bold={isCursor}>{cursorGlyph}</Text>
        <Text>  {open}</Text>
        <Text color={v.glyphColor} bold={!!v.glyphColor}>{v.glyph}</Text>
        <Text>{close} </Text>
        <Text color={kindColor}>{kindGlyph}</Text>
        <Text> {it.name.padEnd(20)} </Text>
        <Text>{it.description}</Text>
        <Text color={v.badgeColor}>{v.badge}</Text>
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      {catalog.groups.map((g) => (
        <Box key={g.id} flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.brand}>
            {g.name}
            {g.kind === 'pick-one' ? <Text dimColor> (pick one)</Text> : null}
          </Text>
          {g.description ? <Text dimColor>{g.description}</Text> : null}
          {g.items.map((it) => renderItem(it, g))}
        </Box>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{GLYPHS.cursor} navigate ↑↓ · space toggle · enter continue · q quit</Text>
        <Text dimColor>uncheck an installed item to uninstall · [{GLYPHS.locked}] = no uninstaller</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm test ItemList`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ItemList.tsx src/ui/theme.ts tests/ui/ItemList.test.tsx
git commit -m "feat(ui): render catalog groups with radio/checkbox glyphs"
```

### Task 5.2: `App.tsx` pick-one selection + auto-swap

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `tests/ui/App.test.tsx`

- [ ] **Step 1: Add a failing test for pick-one auto-deselect** in `tests/ui/App.test.tsx`

Append a test (keep existing tests):

```tsx
it('pick-one selection deselects siblings', async () => {
  const catalog: Catalog = {
    version: 2, updatedAt: '2026-05-05',
    groups: [{
      id: 'memory', name: 'Memory backend', kind: 'pick-one',
      items: [
        { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
        { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
      ],
    }],
  };
  let received: InstallPlan | null = null;
  const { stdin, lastFrame } = render(
    <App
      catalog={catalog}
      initialStates={[{ itemId: 'a', installed: false }, { itemId: 'b', installed: false }]}
      repoRoot={null}
      runInstall={async (plan) => { received = plan; }}
      onComplete={() => {}}
    />,
  );
  // cursor on a (idx 0). space → selects a. down → cursor on b. space → should select b and deselect a.
  stdin.write(' ');
  stdin.write('[B'); // down arrow
  stdin.write(' ');
  stdin.write('\r');       // enter → confirm screen
  stdin.write('\r');       // enter → run
  await new Promise((r) => setTimeout(r, 50));
  expect(received?.selected.map((i) => i.id)).toEqual(['b']);
});
```

- [ ] **Step 2: Add a failing test for auto-swap when an item was already installed**

```tsx
it('auto-swap: selecting B in same group when A is installed queues A for uninstall', async () => {
  const catalog: Catalog = {
    version: 2, updatedAt: '2026-05-05',
    groups: [{
      id: 'memory', name: 'Memory backend', kind: 'pick-one',
      items: [
        { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
        { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
          detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
      ],
    }],
  };
  let received: InstallPlan | null = null;
  const { stdin } = render(
    <App
      catalog={catalog}
      initialStates={[{ itemId: 'a', installed: true }, { itemId: 'b', installed: false }]}
      repoRoot={null}
      runInstall={async (plan) => { received = plan; }}
      onComplete={() => {}}
    />,
  );
  // a is preselected (installed). Move cursor to b, space — selects b, deselects a.
  stdin.write('[B'); // down
  stdin.write(' ');        // pick b
  stdin.write('\r');       // enter -> confirm
  stdin.write('\r');       // enter -> run
  await new Promise((r) => setTimeout(r, 50));
  expect(received?.selected.map((i) => i.id)).toEqual(['b']);
  expect(received?.uninstall?.map((i) => i.id)).toEqual(['a']);
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm test App`
Expected: failures (App still uses v1 layout).

- [ ] **Step 4: Update `src/ui/App.tsx`**

Replace the contents of `App.tsx`:

```tsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { Catalog, CatalogGroup, CatalogItem, EngineEvent, InstallPlan, InstallState, Scope } from '../types.js';
import { ItemList } from './ItemList.js';
import { PluginScopePrompt } from './PluginScopePrompt.js';
import { ConfirmSummary } from './ConfirmSummary.js';
import { ProgressLog } from './ProgressLog.js';
import { PostInstallPanel } from './PostInstallPanel.js';
import { ConflictPrompt } from './ConflictPrompt.js';
import { orderForInstall } from '../engine/ordering.js';
import { Header } from './Header.js';
import { flattenItems, groupByItemId } from '../catalog/groups.js';

type Screen = 'conflict' | 'select' | 'scope' | 'confirm' | 'run' | 'done';

export interface AppProps {
  catalog: Catalog;
  initialStates: InstallState[];
  repoRoot: string | null;
  runInstall: (plan: InstallPlan, onEvent: (e: EngineEvent) => void) => Promise<void>;
  onComplete: (r: { aborted?: boolean; error?: string }) => void;
}

interface ConflictItem { group: CatalogGroup; installedIds: string[] }

function findConflicts(catalog: Catalog, installedIds: Set<string>): ConflictItem[] {
  const out: ConflictItem[] = [];
  for (const g of catalog.groups) {
    if (g.kind !== 'pick-one') continue;
    const inGroup = g.items.filter((i) => installedIds.has(i.id)).map((i) => i.id);
    if (inGroup.length > 1) out.push({ group: g, installedIds: inGroup });
  }
  return out;
}

export function App({ catalog, initialStates, repoRoot, runInstall, onComplete }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const items = useMemo(() => flattenItems(catalog), [catalog]);
  const groupOf = useMemo(() => groupByItemId(catalog), [catalog]);

  const installedIds = useMemo(
    () => new Set(initialStates.filter((s) => s.installed).map((s) => s.itemId)),
    [initialStates],
  );

  // Conflict resolution: if any pick-one group has >1 installed, force a choice.
  const initialConflicts = useMemo(() => findConflicts(catalog, installedIds), [catalog, installedIds]);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictItem[]>(initialConflicts);
  const [forcedUninstallIds, setForcedUninstallIds] = useState<Set<string>>(new Set());

  // Effective installed set after the user resolves conflicts: the kept member stays installed,
  // discarded members are queued for uninstall via forcedUninstallIds.
  const effectiveInstalled = useMemo(() => {
    const s = new Set(installedIds);
    for (const id of forcedUninstallIds) s.delete(id);
    return s;
  }, [installedIds, forcedUninstallIds]);

  const [selected, setSelected] = useState<Set<string>>(new Set(installedIds));
  const [cursor, setCursor] = useState(0);
  const [screen, setScreen] = useState<Screen>(initialConflicts.length > 0 ? 'conflict' : 'select');
  const [scopeCursor, setScopeCursor] = useState<0 | 1>(0);
  const [pluginScope, setPluginScope] = useState<Scope>('global');
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  const newSelected = [...selected].filter((id) => !effectiveInstalled.has(id));
  const userUninstallIds = [...effectiveInstalled].filter((id) => {
    if (selected.has(id)) return false;
    const it = items.find((i) => i.id === id);
    return !!it?.uninstall;
  });
  // Auto-swap: if user picked a different member of a pick-one group whose
  // sibling is currently installed, queue the sibling for uninstall too.
  const autoSwapIds = useMemo(() => {
    const out: string[] = [];
    for (const newId of newSelected) {
      const g = groupOf.get(newId);
      if (!g || g.kind !== 'pick-one') continue;
      for (const sib of g.items) {
        if (sib.id === newId) continue;
        if (effectiveInstalled.has(sib.id) && !selected.has(sib.id) && sib.uninstall) {
          out.push(sib.id);
        }
      }
    }
    return out;
  }, [newSelected, groupOf, effectiveInstalled, selected]);

  const allUninstallIds = Array.from(new Set([...forcedUninstallIds, ...userUninstallIds, ...autoSwapIds]));

  const hasPlugin =
    newSelected.some((id) => items.find((i) => i.id === id)?.kind === 'plugin') ||
    allUninstallIds.some((id) => items.find((i) => i.id === id)?.kind === 'plugin');

  const resolveConflict = useCallback((keptId: string) => {
    setPendingConflicts((cs) => {
      const [head, ...rest] = cs;
      if (!head) return cs;
      const drop = head.installedIds.filter((id) => id !== keptId);
      setForcedUninstallIds((s) => {
        const next = new Set(s);
        for (const id of drop) next.add(id);
        return next;
      });
      // Remove dropped items from `selected` so they don't show as install targets.
      setSelected((s) => {
        const next = new Set(s);
        for (const id of drop) next.delete(id);
        return next;
      });
      if (rest.length === 0) setScreen('select');
      return rest;
    });
  }, []);

  useInput((input, key) => {
    if (input === 'q' && screen !== 'run') {
      onComplete({ aborted: true });
      exit();
      return;
    }

    if (screen === 'conflict') {
      // Handled inside ConflictPrompt via onResolve; no key wiring needed here.
      return;
    }

    if (screen === 'select') {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
      else if (input === ' ') {
        const it = items[cursor]!;
        if (effectiveInstalled.has(it.id) && !it.uninstall) return;
        const group = groupOf.get(it.id);
        setSelected((s) => {
          const next = new Set(s);
          if (group?.kind === 'pick-one') {
            // Radio: select this, deselect siblings; toggle off if already on.
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
        if (newSelected.length === 0 && allUninstallIds.length === 0) { onComplete({}); exit(); return; }
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
          uninstall: allUninstallIds.map((id) => items.find((i) => i.id === id)!),
          pluginScope,
          repoRoot,
        };
        runInstall(plan, (e) => setEvents((evs) => [...evs, e]))
          .then(() => { setScreen('done'); })
          .catch((err) => { setRunError(String(err)); setScreen('done'); });
      }
    } else if (screen === 'done') {
      if (key.return) { onComplete(runError ? { error: runError } : {}); exit(); }
    }
  });

  const hasPrompt = events.some((e) => e.type === 'post-prompt');
  useEffect(() => {
    if (screen !== 'done') return;
    if (runError) return;
    if (hasPrompt) return;
    onComplete({});
    exit();
  }, [screen, runError, hasPrompt, onComplete, exit]);

  let body: React.JSX.Element;
  if (screen === 'conflict' && pendingConflicts[0]) {
    const c = pendingConflicts[0];
    body = <ConflictPrompt group={c.group} installedIds={c.installedIds} onResolve={resolveConflict} />;
  } else if (screen === 'select') {
    body = <ItemList catalog={catalog} states={initialStates.map((s) => effectiveInstalled.has(s.itemId) ? s : { ...s, installed: false })} selected={selected} cursor={cursor} />;
  } else if (screen === 'scope') {
    body = <PluginScopePrompt cursor={scopeCursor} hasRepo={!!repoRoot} />;
  } else if (screen === 'confirm') {
    const uninstallItems = allUninstallIds.map((id) => items.find((i) => i.id === id)!);
    const installItems = orderForInstall(newSelected.map((id) => items.find((i) => i.id === id)!));
    const lines: string[] = [];
    for (const it of [...uninstallItems].reverse()) {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      const sibling = autoSwapIds.includes(it.id)
        ? ` (replaced by ${(groupOf.get(it.id)?.items.find((s) => newSelected.includes(s.id)))?.name ?? ''})`
        : '';
      lines.push(`Uninstall ${it.name}${scope}${sibling}`);
    }
    for (const it of installItems) {
      const scope = it.kind === 'plugin' ? ` (${pluginScope})` : '';
      lines.push(`Install ${it.name}${scope}`);
    }
    body = <ConfirmSummary lines={lines} />;
  } else if (screen === 'run') {
    body = <ProgressLog events={events} />;
  } else {
    body = (
      <Box flexDirection="column">
        <ProgressLog events={events} />
        {runError && (
          <Box marginTop={1} flexDirection="column">
            <Text color="red">Run failed: {runError}</Text>
            <Text dimColor>See the failure event above for the stderr tail.</Text>
          </Box>
        )}
        <Box marginTop={1}><PostInstallPanel events={events} /></Box>
        <Box marginTop={1}><Text dimColor>enter to exit</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header variant="splash" />
      {body}
    </Box>
  );
}
```

- [ ] **Step 5: Typecheck — expect missing ConflictPrompt**

Run: `pnpm typecheck`
Expected: error about missing module `./ConflictPrompt.js`. That's fixed in Task 6.1.

- [ ] **Step 6: Commit (WIP, depends on Task 6.1 to compile)**

Skip the commit for now — bundle with Task 6.1.

---

## Phase 6: Out-of-band conflict prompt

### Task 6.1: `ConflictPrompt` component

**Files:**
- Create: `src/ui/ConflictPrompt.tsx`
- Create: `tests/ui/ConflictPrompt.test.tsx`

- [ ] **Step 1: Failing test** at `tests/ui/ConflictPrompt.test.tsx`

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ConflictPrompt } from '../../src/ui/ConflictPrompt.js';
import type { CatalogGroup } from '../../src/types.js';

const group: CatalogGroup = {
  id: 'memory', name: 'Memory backend', kind: 'pick-one',
  items: [
    { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
      detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
    { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
      detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
  ],
};

describe('ConflictPrompt', () => {
  it('renders the group name and conflicting items', () => {
    const { lastFrame } = render(
      <ConflictPrompt group={group} installedIds={['a', 'b']} onResolve={() => {}} />
    );
    expect(lastFrame()).toMatch(/Memory backend/);
    expect(lastFrame()).toMatch(/conflict/i);
    expect(lastFrame()).toMatch(/A/);
    expect(lastFrame()).toMatch(/B/);
  });

  it('calls onResolve with cursor selection on enter', async () => {
    const onResolve = vi.fn();
    const { stdin } = render(
      <ConflictPrompt group={group} installedIds={['a', 'b']} onResolve={onResolve} />
    );
    // cursor starts at 0 (a). down -> b. enter.
    stdin.write('[B');
    stdin.write('\r');
    expect(onResolve).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test ConflictPrompt`
Expected: import error.

- [ ] **Step 3: Create `src/ui/ConflictPrompt.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { CatalogGroup } from '../types.js';
import { COLORS, GLYPHS } from './theme.js';

export interface ConflictPromptProps {
  group: CatalogGroup;
  installedIds: string[];
  onResolve: (keptId: string) => void;
}

export function ConflictPrompt({ group, installedIds, onResolve }: ConflictPromptProps): React.JSX.Element {
  const conflicting = group.items.filter((i) => installedIds.includes(i.id));
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(conflicting.length - 1, c + 1));
    else if (key.return) {
      const kept = conflicting[cursor];
      if (kept) onResolve(kept.id);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={COLORS.warn} bold>⚠ Conflict in “{group.name}”</Text>
      <Text dimColor>Multiple members are installed but only one is supported. Pick one to keep — the other(s) will be uninstalled.</Text>
      <Box marginTop={1} flexDirection="column">
        {conflicting.map((it, i) => {
          const isCursor = i === cursor;
          return (
            <Text key={it.id} color={isCursor ? COLORS.cursor : undefined}>
              {isCursor ? `${GLYPHS.cursor} ` : '  '}({i === cursor ? GLYPHS.radioOn : GLYPHS.radioOff}) {it.name} — {it.description}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}><Text dimColor>↑↓ navigate · enter keep this one</Text></Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run all UI tests**

Run: `pnpm test ui`
Expected: ConflictPrompt PASS, App pick-one tests PASS, ItemList PASS.

- [ ] **Step 5: Commit (App + ConflictPrompt together)**

```bash
git add src/ui/App.tsx src/ui/ConflictPrompt.tsx tests/ui/ConflictPrompt.test.tsx tests/ui/App.test.tsx
git commit -m "feat(ui): pick-one selection, auto-swap, and conflict prompt"
```

---

## Phase 7: Grouped status output

### Task 7.1: Status command groups by header

**Files:**
- Modify: `src/commands/status.ts`
- Create: `tests/commands/status.test.ts`

- [ ] **Step 1: Failing test** at `tests/commands/status.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { renderStatus } from '../../src/commands/status.js';
import type { Catalog } from '../../src/types.js';

const catalog: Catalog = {
  version: 2, updatedAt: '2026-05-05',
  groups: [
    { id: 'memory', name: 'Memory backend', kind: 'pick-one', items: [
      { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' } },
      { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' } },
    ]},
    { id: 'docs', name: 'Documentation providers', kind: 'pick-many', items: [
      { id: 'c', name: 'C', description: '', kind: 'plugin', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' } },
    ]},
  ],
};

describe('renderStatus', () => {
  it('renders a group header per group', () => {
    const out = renderStatus(catalog, [
      { itemId: 'a', installed: true },
      { itemId: 'b', installed: false },
      { itemId: 'c', installed: false },
    ]);
    expect(out).toMatch(/Memory backend \(pick-one\)/);
    expect(out).toMatch(/Documentation providers/);
    // pick-many group does NOT show "(pick-one)"
    const docsLine = out.split('\n').find((l) => l.includes('Documentation providers'))!;
    expect(docsLine).not.toMatch(/pick-/);
  });

  it('lists each item under its group header', () => {
    const out = renderStatus(catalog, [
      { itemId: 'a', installed: true },
      { itemId: 'b', installed: false },
      { itemId: 'c', installed: false },
    ]);
    const lines = out.split('\n');
    const memHeader = lines.findIndex((l) => l.includes('Memory backend'));
    const docsHeader = lines.findIndex((l) => l.includes('Documentation providers'));
    expect(memHeader).toBeGreaterThanOrEqual(0);
    expect(docsHeader).toBeGreaterThan(memHeader);
    // a and b appear between memHeader and docsHeader
    const aIdx = lines.findIndex((l) => l.includes('A'));
    const cIdx = lines.findIndex((l) => l.includes('C'));
    expect(aIdx).toBeGreaterThan(memHeader);
    expect(aIdx).toBeLessThan(docsHeader);
    expect(cIdx).toBeGreaterThan(docsHeader);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm test status`
Expected: fail (current renderStatus is flat).

- [ ] **Step 3: Update `renderStatus` in `src/commands/status.ts`**

Replace `renderStatus` with:

```ts
export function renderStatus(catalog: import('../types.js').Catalog, states: InstallState[]): string {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  for (const g of catalog.groups) {
    if (lines.length > 0) lines.push('');
    const headerSuffix = g.kind === 'pick-one' ? ' (pick-one)' : '';
    lines.push(paint(`${g.name}${headerSuffix}:`, 'brand'));
    for (const item of g.items) {
      const s = byId.get(item.id);
      const badge = s?.installed
        ? paint(`${GLYPHS.ok} installed`, 'ok')
        : paint(`${GLYPHS.missing} missing  `, 'dim');
      const kindGlyph = item.kind === 'tool'
        ? paint(GLYPHS.tool, 'tool')
        : paint(GLYPHS.plugin, 'plugin');
      const ver = s?.version ? paint(`  (${s.version})`, 'dim') : '';
      lines.push(`  ${badge}  ${kindGlyph} ${item.kind.padEnd(7)}  ${item.name}${ver}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm test status`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/status.ts tests/commands/status.test.ts
git commit -m "feat(commands): grouped status output"
```

### Task 7.2: `default --list` grouped output

**Files:**
- Modify: `src/commands/default.ts`

- [ ] **Step 1: Update `renderDefaultList`**

Replace the body of `renderDefaultList` so it walks `catalog.groups`. Adjust the function signature to take a `Catalog`:

```ts
export function renderDefaultList(catalog: import('../types.js').Catalog, states: InstallState[]): string {
  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  let any = false;
  for (const g of catalog.groups) {
    const defaults = g.items.filter((i) => i.default === true);
    if (defaults.length === 0) continue;
    any = true;
    if (lines.length > 0) lines.push('');
    lines.push(paint(`${g.name}:`, 'brand'));
    for (const it of defaults) lines.push(formatRow(it, stateById.get(it.id)));
  }
  if (!any) lines.push('No items are flagged as defaults.');
  return lines.join('\n') + '\n';
}
```

Update `runDefaultList` to call `renderDefaultList(catalog, states)` instead of `renderDefaultList(defaults, states)`.

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm test default && pnpm typecheck`
Expected: existing default tests may need a tiny update if they pass items directly; if so, update them to pass the catalog.

- [ ] **Step 3: Commit**

```bash
git add src/commands/default.ts tests/
git commit -m "feat(commands): grouped default --list output"
```

---

## Phase 8: Engine ordering test for swap

### Task 8.1: Lock-in test that uninstall-A precedes install-B

**Files:**
- Modify: `tests/engine/ordering.test.ts` (or create if missing)

- [ ] **Step 1: Verify test exists**

Run: `pnpm exec ls tests/engine`
If no `ordering.test.ts`, create it.

- [ ] **Step 2: Add a test**

```ts
import { describe, it, expect } from 'vitest';
import { orderForInstall, orderForUninstall } from '../../src/engine/ordering.js';
import type { CatalogItem } from '../../src/types.js';

const item = (id: string, kind: 'tool' | 'plugin'): CatalogItem => ({
  id, name: id, description: '', kind, defaultScope: 'global',
  detect: { command: 't' }, install: { command: 't' }, uninstall: { command: 't' },
});

describe('install/uninstall ordering during a swap', () => {
  it('uninstall list reverses install order so removed items go first', () => {
    const a = item('a', 'tool');
    const b = item('b', 'tool');
    const installOrder = orderForInstall([b]).map((i) => i.id);
    const uninstallOrder = orderForUninstall([a]).map((i) => i.id);
    // The executor processes uninstall list before install list.
    // Concatenation preserves "a uninstalled before b installed".
    expect([...uninstallOrder, ...installOrder]).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 3: Run + commit**

Run: `pnpm test ordering`
Expected: PASS.

```bash
git add tests/engine/ordering.test.ts
git commit -m "test(engine): swap orders uninstall before install"
```

---

## Phase 9: End-to-end happy path

### Task 9.1: E2E swap test

**Files:**
- Create: `tests/e2e/swap-memory.test.ts`

- [ ] **Step 1: Write E2E test**

(Full test code below — uses the same patterns as existing tests in `tests/e2e/`. If the E2E harness differs, mirror it.)

```ts
import { describe, it, expect, vi } from 'vitest';
import { App } from '../../src/ui/App.js';
import { render } from 'ink-testing-library';
import React from 'react';
import type { Catalog, EngineEvent, InstallPlan } from '../../src/types.js';

const catalog: Catalog = {
  version: 2, updatedAt: '2026-05-05',
  groups: [{
    id: 'memory', name: 'Memory backend', kind: 'pick-one',
    items: [
      { id: 'claude-mem', name: 'claude-mem', description: '', kind: 'plugin', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' }, uninstall: { command: 't' } },
      { id: 'mempalace', name: 'MemPalace', description: '', kind: 'tool', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' }, uninstall: { command: 't' } },
    ],
  }],
};

describe('e2e: memory swap', () => {
  it('selecting MemPalace when claude-mem is installed produces a plan that uninstalls claude-mem and installs MemPalace', async () => {
    let captured: InstallPlan | null = null;
    const runInstall = vi.fn(async (plan: InstallPlan, _onEvent: (e: EngineEvent) => void) => {
      captured = plan;
    });
    const { stdin } = render(
      <App
        catalog={catalog}
        initialStates={[
          { itemId: 'claude-mem', installed: true },
          { itemId: 'mempalace', installed: false },
        ]}
        repoRoot={null}
        runInstall={runInstall}
        onComplete={() => {}}
      />,
    );
    // No conflict (only one installed). select screen: cursor 0 = claude-mem (preselected).
    // Move down to mempalace, press space.
    stdin.write('[B');
    stdin.write(' ');
    stdin.write('\r'); // confirm
    stdin.write('\r'); // run
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).not.toBeNull();
    expect(captured!.selected.map((i) => i.id)).toEqual(['mempalace']);
    expect(captured!.uninstall?.map((i) => i.id)).toEqual(['claude-mem']);
  });

  it('out-of-band: both installed → conflict screen → keep mempalace → uninstall claude-mem', async () => {
    let captured: InstallPlan | null = null;
    const runInstall = vi.fn(async (plan: InstallPlan) => { captured = plan; });
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog}
        initialStates={[
          { itemId: 'claude-mem', installed: true },
          { itemId: 'mempalace', installed: true },
        ]}
        repoRoot={null}
        runInstall={runInstall}
        onComplete={() => {}}
      />,
    );
    // Conflict screen up. Cursor on claude-mem; press down to MemPalace, enter.
    expect(lastFrame()).toMatch(/Conflict/);
    stdin.write('[B');
    stdin.write('\r');
    // Now on select screen. Press enter to confirm everything.
    stdin.write('\r');
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));
    expect(captured!.uninstall?.map((i) => i.id)).toContain('claude-mem');
    expect(captured!.selected.map((i) => i.id)).not.toContain('claude-mem');
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test swap-memory`
Expected: PASS.

- [ ] **Step 3: Run full suite**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/swap-memory.test.ts
git commit -m "test(e2e): memory swap happy path + out-of-band conflict resolution"
```

---

## Verification

- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` all pass.
- [ ] `pnpm build` produces `dist/` without errors.
- [ ] Manual smoke: `pnpm start` shows grouped wizard with `Memory backend (pick one)` containing claude-mem + MemPalace.
- [ ] Manual smoke: `pnpm start status` shows grouped output.
- [ ] Manual smoke: `pnpm start default --list` shows defaults grouped by group.

---

## Notes for the implementer

- **Style:** ESM only, every relative import ends in `.js`.
- **Don't reorder groups** in `catalog.json` once shipped without thinking — order is the UI display order.
- **MemPalace MCP command** in the catalog (`claude mcp add mempalace -- mempalace mcp`) is a best-guess from MemPalace's README. If their docs specify a different setup command (e.g. `mempalace setup`), prefer that and update the `postInstall` in catalog.json + bundled.json.
- **No back-compat.** v1 catalogs in user caches will be rejected and the loader will fall through to `bundled.json` (the new v2). That's the intended behavior — the cache TTL is 24h so users self-heal quickly.
