# Combined Scope Screen for Plugins & MCP — Design

**Status:** Draft
**Date:** 2026-05-07
**Scope:** Wizard scope screen (`src/ui/PluginScopePrompt.tsx` → `ScopePrompt.tsx`),
`src/ui/ConfirmSummary.tsx`, `src/ui/App.tsx`, `src/engine/executor.ts`,
`src/engine/mcp-config.ts`, `src/engine/detect.ts`, CLI dry-run plumbing.

## Problem

The "How should plugins be installed?" screen only shows the Global/Project
choice — it doesn't show *what* is about to be installed at that scope, so the
user has to remember their selection from the previous screen. The screen also
ignores MCP servers entirely: MCP items are silently written to
`<repo>/.mcp.json` regardless of any scope intent. There's no way to install
an MCP server at the user level, and no way to preview engine actions without
actually running them.

## Goals

1. **Show selection in context.** The scope screen lists the plugins and MCP
   servers in the plan, grouped by kind, so the user sees what the choice
   applies to.
2. **One scope, two kinds.** Plugins and MCP servers share a single scope
   choice. `global` means user-level (`~/.claude` for plugins, `~/.claude.json`
   for MCP). `project` means repo-local (`.claude` plugin scope and
   `<repo>/.mcp.json`).
3. **Confirm screen grouped by kind.** "The following actions will run" lists
   actions under Tools / Plugins / MCP servers headings, with the scope shown
   once per kind heading.
4. **Engine honours scope for MCP.** `applyMcpInstall` /
   `applyMcpUninstall` write to the correct config file based on
   `plan.scope`.
5. **Dry-run is a first-class CLI flag.** `--dry-run` on `install`, `update`,
   `remove` runs the wizard normally and emits the same event stream, but
   skips filesystem writes and records intended actions for inspection.

## Non-goals

- Per-item scope (every plugin and MCP in a single run shares one scope).
- Mixed/conflict resolution when an MCP key exists in both `.mcp.json` and
  `~/.claude.json`.
- Migration commands (e.g. moving an existing project MCP entry to global).
- New scope levels beyond `global` / `project`.

## Architecture

```
select screen ──► newSelected + uninstalls
                   │
   has plugin OR mcp?  AND  repoRoot?
                   │
        yes ──► combined scope screen
                   │     (lists plugins & mcps grouped by kind)
                scope: 'global' | 'project'
                   │
                   ▼
                confirm screen
                   │     (Tools / Plugins / MCP servers, scope on heading)
                   ▼
                run ──► engine (dry-run respects --dry-run flag)
                          ├─ plugin install: cwd = repo (project) or undefined (global)
                          └─ mcp install: writes .mcp.json (project) or ~/.claude.json (global)
```

### Field rename

`InstallPlan.pluginScope` → `InstallPlan.scope`. The `Scope` type
(`'global' | 'project'`) is unchanged. All call sites (executor, App, tests)
update.

### `src/ui/ScopePrompt.tsx` (renamed from `PluginScopePrompt.tsx`)

```ts
interface ScopePromptProps {
  cursor: 0 | 1;
  hasRepo: boolean;
  groups: {
    kind: 'plugin' | 'mcp';
    label: string;            // "Plugins" | "MCP servers"
    installs: string[];       // item names
    uninstalls: string[];
  }[];
}
```

Layout:

```
How should plugins & MCP servers be installed?

Selected:
  Plugins
    + ⌬ superpowers
    - ⌬ claude-mem        (will uninstall)
  MCP servers
    + ⌬ context7
    + ⌬ microsoft-learn

  ◉ Globally (~/.claude — applies to all projects)
  ○ This project only (.claude + .mcp.json in repo root)

↑↓ navigate · enter confirm
```

- Kind heading suppressed when no items of that kind are present.
- Within each kind: installs (`+`, green) before uninstalls (`-`, yellow).
- Tools never appear here; their scope is moot.
- Empty `groups` → "Selected" block omitted (defensive).

`App.tsx` builds `groups` once and triggers the screen when
`(hasPlugin || hasMcp) && repoRoot`.

### `src/ui/ConfirmSummary.tsx`

Replace flat `lines: string[]` with grouped structure:

```ts
interface ConfirmSummaryProps {
  groups: {
    label: string;            // "Tools" | "Plugins" | "MCP servers"
    scopeSuffix?: string;     // " (project)" | " (global)" | undefined for tools
    actions: {
      verb: 'Install' | 'Uninstall';
      name: string;
      suffix?: string;        // e.g. "(replaced by mempalace)"
    }[];
  }[];
}
```

Layout:

```
The following actions will run:

  Tools
    + Install rtk
    - Uninstall graphify

  Plugins (project)
    + Install superpowers
    - Uninstall claude-mem (replaced by mempalace)

  MCP servers (project)
    + Install context7

enter to start · q to quit
```

Order: Tools → Plugins → MCP servers (matches install ordering). Within each
kind, uninstalls listed first (they run first), then installs. `App.tsx`
partitions `installItems` / `uninstallItems` by kind to build the prop.

### `src/engine/mcp-config.ts`

Drop the implicit `<repoRoot>/.mcp.json` path. Public functions take a path:

```ts
export async function readMcpConfig(path: string): Promise<McpConfig>
export async function writeMcpConfig(path: string, cfg: McpConfig): Promise<void>

export function mcpConfigPath(scope: Scope, repoRoot: string | null): string {
  if (scope === 'global') return join(homedir(), '.claude.json');
  if (!repoRoot) throw new Error('project-scope mcp install requires repoRoot');
  return join(repoRoot, '.mcp.json');
}
```

`addMcpServer` / `removeMcpServer` / `hasMcpServer` are unchanged (they
operate on `McpConfig` values, not paths).

### `src/engine/executor.ts`

```ts
async function applyMcpInstall(item: McpItem, plan: InstallPlan): Promise<void> {
  const path = mcpConfigPath(plan.scope, plan.repoRoot);
  const cfg = await readMcpConfig(path);
  if (hasMcpServer(cfg, item.mcpKey)) return;
  await writeMcpConfig(path, addMcpServer(cfg, item.mcpKey, item.mcpServer));
}

async function applyMcpUninstall(item: McpItem, plan: InstallPlan): Promise<void> {
  const path = mcpConfigPath(plan.scope, plan.repoRoot);
  const cfg = await readMcpConfig(path);
  if (!hasMcpServer(cfg, item.mcpKey)) return;
  await writeMcpConfig(path, removeMcpServer(cfg, item.mcpKey));
}
```

`resolveCwd`: same logic, just renamed field
(`plan.scope === 'project'`).

Dry-run records updated to surface the resolved path:

```
# write context7 to /Users/steven/.claude.json     (scope=global)
# write context7 to /repo/.mcp.json                (scope=project)
# remove context7 from /Users/steven/.claude.json  (scope=global)
```

For shell items the existing `record?.(item.install.command)` is wrapped to
include `cwd` when set: `(cd /repo && claude plugin install superpowers)`.

### `src/engine/detect.ts`

When checking MCP items, read both `<repoRoot>/.mcp.json` and
`~/.claude.json`. Report `installed: true` if either contains the
`mcpKey`. Both files are read via the same `readMcpConfig(path)` helper;
ENOENT → empty config (existing behaviour).

### CLI: `--dry-run`

`install`, `update`, `remove` gain a `--dry-run` flag (default `false`).
When set:

- Wizard flow is unchanged through `select` → `scope` → `confirm` → `run`.
- The engine receives `dryRun: true` and a `record` collector.
- Engine emits the same `EngineEvent` stream so `ProgressLog` renders normally.
- The recorded lines are appended to the `done` screen under the progress log
  ("Recorded actions:" header) so the user can scroll-back-free read the plan.

The `default` command is intentionally not given `--dry-run` — its purpose is
silent fleet automation; users wanting preview run `npx auto-claude --dry-run`.

## Data flow

```
ScopePrompt receives:
  groups = partition(installs ∪ uninstalls, by kind ∈ {plugin, mcp})

ConfirmSummary receives:
  groups = [
    { label: 'Tools', scopeSuffix: undefined, actions: [...] },
    { label: 'Plugins', scopeSuffix: ` (${plan.scope})`, actions: [...] },
    { label: 'MCP servers', scopeSuffix: ` (${plan.scope})`, actions: [...] },
  ].filter(g => g.actions.length > 0)

executor:
  for each mcp item: path = mcpConfigPath(plan.scope, plan.repoRoot)
  for each plugin item: cwd = (plan.scope === 'project' ? repoRoot : undefined)
```

## Testing

| Test | Type | Asserts |
|---|---|---|
| `ScopePrompt.test.tsx` — renders grouped selection | unit | Kind headings appear when items present, suppressed when empty; install rows precede uninstall rows |
| `ScopePrompt.test.tsx` — single kind | unit | Only one heading rendered when plan has plugins but no MCPs (and vice versa) |
| `ConfirmSummary.test.tsx` — grouped by kind | unit | Three section layout (Tools / Plugins / MCP servers) with scope suffix on Plugins and MCP headings only |
| `App.test.tsx` — scope screen triggers for MCP | integration | Plan with only an MCP item + `repoRoot` → `scope` screen rendered, not `confirm` |
| `App.test.tsx` — scope flows to plan | integration | Picking "Globally" on combined screen → `plan.scope === 'global'` reaches `runInstall` |
| `mcp-config.test.ts` — `mcpConfigPath` | unit | Returns `~/.claude.json` for global, `<repoRoot>/.mcp.json` for project, throws for project without repoRoot |
| `executor.test.ts` — MCP install global scope | integration | dryRun records `~/.claude.json` path; real run writes there |
| `executor.test.ts` — MCP install project scope | integration | dryRun records `<repoRoot>/.mcp.json`; behaviour unchanged from today |
| `executor.test.ts` — MCP uninstall mirrors install | integration | Uninstall reads/writes the scope-resolved path |
| `detect.test.ts` — MCP detected globally | unit | Item present only in `~/.claude.json` reports `installed: true` |
| `detect.test.ts` — MCP detected in either | unit | Item present in either file → installed; absent in both → not installed |
| `cli.test.ts` — `--dry-run` flag | e2e | `npx auto-claude install --dry-run` runs to completion without writing files; recorded actions present in stdout |

## Tradeoffs

- **No backwards-compat alias for `pluginScope`.** The plan type is internal;
  rename is mechanical. Keeping both adds noise.
- **Scope shown on heading, not per row, in confirm screen.** Cleaner output,
  and now correct: every plugin/MCP in a run shares the same scope.
- **`detect.ts` reads two files for MCP.** Slight cost (one extra fs.read per
  detect call); negligible. Required for accurate status after global install.
- **No conflict UI** when an MCP key appears in both global and project
  configs. Status reports installed; uninstall removes from the
  scope-resolved path only. Users can re-run with the other scope to clean
  up.
- **`--dry-run` reuses existing engine plumbing.** No new abstraction —
  `dryRun: boolean` and `record` callback already exist; this just exposes
  them through the CLI.

## Risks

- **`~/.claude.json` shape.** This file already exists for many users (Claude
  Code stores config there). The engine writes only the `mcpServers` key,
  preserving everything else. Mitigation: `readMcpConfig` parses the full
  file, `writeMcpConfig` does an immutable update of `mcpServers` and
  serialises the whole object back. Test: round-trip a file with unrelated
  keys and verify they survive.
- **Empty `~/.claude.json` doesn't exist on first install.** Mitigation:
  ENOENT → empty `{ mcpServers: {} }` (current behaviour; works the same for
  the new path).
- **Dry-run leaks side-effects.** Mitigation: every fs write in `executor.ts`
  / `mcp-config.ts` is gated on `!opts.dryRun`. Verified by the dry-run e2e
  test asserting no files are modified.

## File inventory

| File | Status |
|---|---|
| `src/ui/ScopePrompt.tsx` | new (replaces `PluginScopePrompt.tsx`) |
| `src/ui/PluginScopePrompt.tsx` | deleted |
| `src/ui/ConfirmSummary.tsx` | modify (grouped prop shape) |
| `src/ui/App.tsx` | modify (build grouped props, broaden scope trigger, rename field) |
| `src/types.ts` | modify (`pluginScope` → `scope`) |
| `src/engine/mcp-config.ts` | modify (path-taking API, add `mcpConfigPath`) |
| `src/engine/executor.ts` | modify (scope-aware MCP, dry-run records, field rename) |
| `src/engine/detect.ts` | modify (read both MCP files) |
| `src/commands/install.tsx` | modify (`--dry-run` flag plumbing) |
| `src/commands/update.ts` | modify (same) |
| `src/commands/remove.ts` | modify (same) |
| `src/cli.ts` | modify (register `--dry-run` on relevant commands) |
| `tests/ui/ScopePrompt.test.tsx` | new |
| `tests/ui/ConfirmSummary.test.tsx` | modify |
| `tests/ui/App.test.tsx` | modify |
| `tests/engine/mcp-config.test.ts` | modify |
| `tests/engine/executor.test.ts` | modify |
| `tests/engine/detect.test.ts` | modify |
| `tests/e2e/dry-run.test.ts` | new |
