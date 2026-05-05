# auto-claude enhancements bundle — design

**Date:** 2026-05-05
**Branch (target):** `dev` → eventual `main`
**Status:** approved design, awaiting implementation plan

This spec bundles four independent enhancements that emerged from a single
brainstorming pass. They are intentionally scoped together because they all
touch the catalog/UI/release surface and share test infrastructure, but each
section is independently shippable.

1. Recolor catalog group names from brand-orange to blue.
2. Add a new `kind: 'mcp'` catalog item type that installs MCP servers into
   the project's `.mcp.json`.
3. Add a GitHub Actions workflow that auto-versions and publishes the package
   to npm, modeled on
   [`baoduy/outline-openspec-mcp/.github/workflows/npm-publish.yaml`](https://github.com/baoduy/outline-openspec-mcp/blob/main/.github/workflows/npm-publish.yaml).
4. Add `microsoft/skills` and `microsoft/azure-skills` to the catalog as
   plugin marketplace entries; rename the host group accordingly.

---

## 1. Group-name color → blue

### Goal
Catalog group titles render in blue across every surface that shows them
(wizard list, `status`, `default --list`). The conflict-prompt header keeps
its warning color.

### Changes

**`src/ui/theme.ts`**
- Add semantic color: `COLORS.group: 'blue'`.
- Extend `PaintColor` union with `'group'`.
- Extend the `ANSI` map: `group: '\x1b[34m'`.

**Call sites updated to use `group`:**
- `src/ui/ItemList.tsx` — the `<Text bold color={COLORS.brand}>` wrapping
  `g.name` becomes `<Text bold color={COLORS.group}>`.
- `src/commands/status.ts` — `paint(\`${g.name}${headerSuffix}:\`, 'brand')`
  → `paint(..., 'group')`.
- `src/commands/default.ts` — `paint(\`${g.name}:\`, 'brand')` →
  `paint(..., 'group')`.

**Untouched:**
- `src/ui/ConflictPrompt.tsx` — keeps `COLORS.warn` (it is an alert, not a
  group label).
- The `brand` color stays for header/figlet rendering and any other
  brand-specific surfaces.

### Tests
- Update any existing assertion that snapshots the brand-orange ANSI escape
  for group names; switch to the blue `\x1b[34m` escape.
- Add a small unit test asserting `paint('hi', 'group')` emits `\x1b[34m...`
  on a TTY and degrades to plain text otherwise.

---

## 2. New `kind: 'mcp'` catalog item type

### Goal
A user can drop an MCP server entry into the catalog, select it in the
wizard (multi-select alongside other MCPs), and have auto-claude write it
into the project's `.mcp.json`. Re-running the wizard skips MCPs that are
already configured. Unselecting an installed MCP removes its key.

### Schema

**`src/types.ts`**

```ts
export type ItemKind = 'tool' | 'plugin' | 'mcp';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// CatalogItem becomes a discriminated union keyed by `kind`.
export type CatalogItem = ToolItem | PluginItem | McpItem;

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
  /** Key under which the server is written in .mcp.json's mcpServers. */
  mcpKey: string;
  /** Server config to merge into mcpServers[mcpKey]. */
  mcpServer: McpServerConfig;
  // No detect/install/uninstall/update/defaultScope — derived from the file.
}
```

**`src/catalog/schema.ts`** — Zod schema gains the `mcp` variant via
`z.discriminatedUnion('kind', [...])`. `mcpServer.command` is required;
`args` and `env` default to `[]` / `{}` respectively. `mcpKey` must be a
non-empty string and is unique within the catalog (validation pass).

### Lifecycle (project scope only)

A new helper module `src/engine/mcp-config.ts` owns all `.mcp.json` IO:

- `readMcpConfig(repoRoot): { mcpServers: Record<string, McpServerConfig> }`
  — returns `{ mcpServers: {} }` if the file is missing or empty.
- `hasMcpServer(config, key): boolean`
- `addMcpServer(config, key, server): config'` — no-op if `key` already
  exists.
- `updateMcpServer(config, key, server): config'` — overwrites only that
  key; leaves other servers untouched.
- `removeMcpServer(config, key): config'` — deletes the key; leaves the
  empty `mcpServers` object intact.
- `writeMcpConfig(repoRoot, config): void` — writes 2-space indented JSON
  with trailing newline; creates the file if missing.

### Engine integration

**`src/engine/detect.ts`** — when an item has `kind: 'mcp'`, skip `execa`
and instead read the file: `installed = hasMcpServer(config, item.mcpKey)`.
The `version` field stays `undefined`.

**`src/engine/executor.ts`** — when an item has `kind: 'mcp'`:
- **Install:** read config; if the key already exists, emit `item-success`
  immediately (idempotent skip). Else `addMcpServer` + `writeMcpConfig`.
- **Uninstall:** `removeMcpServer` + `writeMcpConfig`. If the key wasn't
  there, still treat as success.
- **Update:** `updateMcpServer` + `writeMcpConfig` if the on-disk config
  differs from the catalog config; otherwise success no-op.
- **Failure mode:** any IO/JSON error emits `item-failure` with a
  truncated stderr-equivalent message (`stderrTail`) carrying the exception
  text.

The same `EngineEvent` stream is preserved — UI does not need to care that
the work isn't a subprocess.

### Repo requirement

MCP items are project-only. If `plan.repoRoot` is `null`:
- They are filtered out of the wizard list with one dim-text line:
  *"MCP items require a project (no repo detected)."*
- `auto-claude default` skips them silently in non-repo runs.

### UI

**`src/ui/theme.ts`**
- `COLORS.mcp: 'green'` (distinct from tool=cyan, plugin=magenta).
- `GLYPHS.mcp: '⚡'`.

**`src/ui/ItemList.tsx`**
- `visualsFor` learns `kind === 'mcp'` → uses the green/⚡ pair.
- Unchanged wrt selection mechanics: MCPs sit in a `pick-many` group, so
  multi-select Just Works.

**Plain stdout (`status.ts`, `default.ts`)** — render MCP items with the
new glyph and color via `paint(..., 'mcp')` (extend `PaintColor`).

### Catalog placement

Add a new top-level group:

```json
{
  "id": "mcp-servers",
  "name": "MCP servers (project)",
  "kind": "pick-many",
  "items": [ /* mcp items */ ]
}
```

Two seed entries (final list TBD with the user before merging, but at
minimum the catalog must validate against the schema):

- A reference example: e.g. `context7-mcp` (npx-based) — proves the path.
- One Microsoft Learn MCP entry (mirrors the existing plugin entry's
  intent but installs to `.mcp.json` instead of via `claude plugin`).

### Tests

- `tests/engine/mcp-config.test.ts` — unit tests for each helper:
  empty-file create, idempotent add, update overwrite, remove preserves
  unrelated keys, malformed JSON yields a clear error.
- `tests/engine/executor-mcp.test.ts` — install/uninstall/update flows
  emit the expected `EngineEvent` sequence.
- `tests/catalog/schema.test.ts` — accepts a valid `mcp` item, rejects
  one missing `mcpKey` or `mcpServer.command`, rejects duplicate `mcpKey`s.
- `tests/ui/ItemList.mcp.test.tsx` — renders the green/⚡ visuals.
- `tests/e2e/install-mcp.test.ts` — wizard selects two MCPs, both land in
  `.mcp.json`; re-run is a no-op; uncheck removes only the unchecked key.

---

## 3. GitHub Actions: auto-version + npm publish

### Goal
Pushing to `main` (or running the workflow manually) computes the next
semver from commit history, runs typecheck/test/build, updates
`package.json`, creates a GitHub Release, and publishes to npm.

### File

`.github/workflows/npm-publish.yaml`

### Triggers

- `push` to `main`
- `workflow_dispatch` with a `release` boolean input (default `"true"`)

### Concurrency

```yaml
concurrency:
  group: npm-publish-${{ github.ref }}
  cancel-in-progress: false
```

### Steps (adapted to pnpm)

1. `actions/checkout@v4` with `fetch-depth: 0` and `fetch-tags: true`.
2. `paulhatch/semantic-version@v5.4.0` with the same config as the
   reference: `tag_prefix: "v"`, `major_pattern: "(MAJOR)"`,
   `minor_pattern: "(MINOR)"`, `version_format: "${major}.${minor}.${patch}"`,
   `bump_each_commit: false`, `search_commit_body: false`.
3. Export `NEXT_VERSION` to `$GITHUB_ENV`; print it.
4. `pnpm/action-setup@v4` (version derived from the
   `packageManager` field of `package.json`).
5. `actions/setup-node@v4` with `node-version: 20`,
   `registry-url: 'https://registry.npmjs.org/'`, `cache: 'pnpm'`.
6. `pnpm install --frozen-lockfile`
7. `pnpm typecheck`
8. `pnpm test`
9. `pnpm build` (with `NODE_OPTIONS='--max_old_space_size=4096'`).
10. `npm version "$NEXT_VERSION" --no-git-tag-version --allow-same-version`.
11. Compute `enable` flag: `true` on push to `main` or when the dispatch
    input is `"true"`.
12. If `enable`: `softprops/action-gh-release@v2` with
    `generate_release_notes: true`, `make_latest: true`,
    `tag_name: v${NEXT_VERSION}`.
13. If `enable`: `npm publish --access public --no-git-checks` with
    `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.

### Permissions

```yaml
permissions:
  contents: write
  packages: write
  id-token: write
```

### Side change

Add `"packageManager": "pnpm@9.x.x"` (pinning the exact version installed
locally) to `package.json` so `pnpm/action-setup` reads it directly.

### Repo configuration (manual, not in code)

Add a repo secret named `NPM_TOKEN` (npm automation token, "Publish"
scope). Document this in `README.md` under a new *Releases* section.

### Tests
None automated for the workflow file itself. The workflow is exercised by
its first dispatch. Local sanity: `act` or `gh workflow view` if available.

---

## 4. Microsoft skill-pack marketplaces

### Goal
Two new entries in the renamed group give users a one-click way to add the
Microsoft skill marketplaces and install their full plugin set.

### Group rename

`catalog.json` group with `id: 'core-plugins'` is renamed:

- **Before:** `"name": "Core Claude Code plugins"`
- **After:** `"name": "Core plugins & skill packs"`

The `id` does **not** change (avoids breaking any references).

### New entries

Both items live inside the `core-plugins` group with
`kind: 'plugin'`, `defaultScope: 'global'`, `default: false`.

```json
{
  "id": "microsoft-skills",
  "name": "microsoft/skills",
  "description": "Microsoft skill marketplace (general-purpose)",
  "kind": "plugin",
  "homepage": "https://github.com/microsoft/skills",
  "defaultScope": "global",
  "default": false,
  "detect": { "command": "claude plugin list", "versionMatch": "microsoft-skills" },
  "install": {
    "command": "claude plugin marketplace add microsoft/skills && claude plugin install <plugin-id>@microsoft-skills"
  },
  "uninstall": {
    "command": "claude plugin uninstall <plugin-id>@microsoft-skills"
  }
}
```

```json
{
  "id": "azure-skills",
  "name": "microsoft/azure-skills",
  "description": "Microsoft Azure skill marketplace",
  "kind": "plugin",
  "homepage": "https://github.com/microsoft/azure-skills",
  "defaultScope": "global",
  "default": false,
  "detect": { "command": "claude plugin list", "versionMatch": "azure-skills" },
  "install": {
    "command": "claude plugin marketplace add microsoft/azure-skills && claude plugin install <plugin-id>@azure-skills"
  },
  "uninstall": {
    "command": "claude plugin uninstall <plugin-id>@azure-skills"
  }
}
```

> **Implementation note:** the `<plugin-id>` placeholders must be resolved
> from each marketplace's manifest before merge. If the marketplaces
> publish multiple plugins each, the implementation phase should choose
> between (a) installing every published plugin, or (b) installing one
> "umbrella" plugin id. This is the only open question carried into
> implementation; the rest of the design is final.

### Tests
- `tests/catalog/schema.test.ts` — both new entries validate.
- `tests/catalog/microsoft-skills.test.ts` — assert presence in the
  `core-plugins` group; assert `default: false`.

---

## Out of scope (explicit non-goals)

- Per-skill granular installation from `microsoft/skills` (deferred —
  needs a marketplace-aware extension to the catalog model).
- Global-scope MCP installation (existing `kind: 'tool'` entries already
  cover that via `claude mcp add`).
- Migration of existing MCP-via-`claude mcp add` entries to the new `mcp`
  kind. They keep working as-is; new MCPs use the new path.
- Pre-release / `next` npm dist-tags.
- Renaming any other group besides `core-plugins`.

---

## Rollout order (suggested for the implementation plan)

1. Section 1 (color change) — smallest, isolated.
2. Section 4 (Microsoft entries + group rename) — pure JSON + tests.
3. Section 2 (`mcp` kind) — biggest surface, but self-contained.
4. Section 3 (publish workflow) — last, so the first published version
   carries all four changes.
