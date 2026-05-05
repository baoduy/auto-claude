# auto-claude — Design Spec

**Date:** 2026-05-05
**Status:** Draft, pending user review

## 1. Overview

`auto-claude` is a Node.js + TypeScript CLI/TUI utility that installs and manages a curated set of Claude Code tools and plugins. It is modeled after [autoskills](https://github.com/midudev/autoskills): users run `npx auto-claude`, pick items from an interactive checklist, and the tool installs them with appropriate post-install steps.

The default flow is a single-pass install wizard. Lifecycle operations (status / update / remove) are exposed via subcommands.

## 2. Goals

- One command (`npx auto-claude`) bootstraps a curated Claude Code setup.
- Detect what is already installed; never silently re-install.
- Run shell-automatable post-install steps automatically; clearly surface non-automatable steps (e.g., prompts the user must give to Claude itself).
- Support both global and project-scoped plugin installation.
- Catalog is remote-updatable so new tools can be added without releasing a new auto-claude version.

## 3. Non-Goals

- Not a general package manager. Catalog is curated.
- Not a configuration editor for `.claude/settings.json`, hooks, or skills (claude-code-setup plugin handles that).
- No automatic rollback on partial failure (out of scope; users re-run after fixing the underlying issue).

## 4. User Flow (default `npx auto-claude`)

1. **Load catalog** — remote → 24h cache → bundled fallback.
2. **Selection screen** — checkbox list of all catalog items, grouped by `kind` (Tools / Plugins). Already-installed items show a ✅ badge and are locked-checked.
3. **Plugin scope prompt** — shown once if any plugins are selected. Single radio choice applies to all selected plugins:
   - Globally (`~/.claude`)
   - This project only (cwd's git root)
4. **Confirmation summary** — list of actions in execution order.
5. **Execution** — runs in this order: global tools → repo-aware tools → plugins. Each item's `postInstall` actions execute immediately after its install command. Failure halts the run.
6. **Post-install panel** — at end, displays any `claude-prompt` actions as copyable text the user should send to Claude.

## 5. Architecture

```
auto-claude/
├── src/
│   ├── cli.ts                    # entry; argv parsing (commander)
│   ├── commands/
│   │   ├── install.ts            # default Ink wizard
│   │   ├── remove.ts
│   │   ├── update.ts
│   │   └── status.ts
│   ├── catalog/
│   │   ├── loader.ts             # remote fetch + cache + bundled fallback
│   │   ├── schema.ts             # zod validation
│   │   └── bundled.json          # offline fallback shipped with package
│   ├── engine/
│   │   ├── detect.ts             # runs detect commands
│   │   ├── executor.ts           # runs install/uninstall/update + post-install
│   │   ├── ordering.ts           # globals → repo-aware → plugins
│   │   └── project.ts            # git-root detection
│   ├── ui/                       # Ink components (only place React lives)
│   │   ├── App.tsx
│   │   ├── ItemList.tsx
│   │   ├── PluginScopePrompt.tsx
│   │   ├── ConfirmSummary.tsx
│   │   ├── ProgressLog.tsx
│   │   └── PostInstallPanel.tsx
│   └── types.ts
├── catalog.json                  # source of truth, served via raw.githubusercontent
├── package.json
└── tsconfig.json
```

**Boundaries:**
- `catalog/` is pure data — no Ink, no engine.
- `engine/` is headless and testable — no Ink. Emits events for UI to subscribe to.
- `ui/` is the only place React/Ink lives.
- `commands/` orchestrates: load catalog → invoke engine → render UI.

This separation lets `auto-claude status` (plain stdout) reuse `engine/detect` without rendering Ink.

## 6. Catalog Schema

```ts
type Scope = 'global' | 'project';
type ItemKind = 'tool' | 'plugin';

interface PostInstallAction {
  type: 'shell' | 'claude-prompt';
  value: string;          // shell command, or human-readable instruction
  requiresRepo?: boolean; // skip if not in a git repo
  label?: string;         // shown in progress log / panel
}

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  homepage?: string;
  defaultScope: Scope;
  // Detection: run `command`. If `versionMatch` is set, item is "installed" iff
  // the regex matches stdout. Otherwise, item is "installed" iff exit code is 0.
  detect: { command: string; versionMatch?: string };
  install:    { command: string; cwd?: 'repo-root' | 'cwd' };
  uninstall?: { command: string; cwd?: 'repo-root' | 'cwd' };
  update?:    { command: string; cwd?: 'repo-root' | 'cwd' };
  postInstall?: PostInstallAction[];
}

interface Catalog {
  version: number;        // schema version; currently 1
  updatedAt: string;      // ISO date
  items: CatalogItem[];
}
```

**Plugin scope handling:** `kind === 'plugin'` items honor the user's one-shot scope choice. The executor sets cwd to the git root for project-scoped installs and to the user's home for global. The exact mechanism (`claude plugin install` cwd-sensitivity vs. an explicit flag) is verified during implementation.

### 6.1 Initial Catalog (4 items)

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
      "install":   { "command": "<verify exact install command from rtk-ai/rtk during implementation>" },
      "uninstall": { "command": "<verify during implementation>" },
      "update":    { "command": "<verify during implementation>" },
      "postInstall": [
        { "type": "shell", "value": "rtk init -g", "requiresRepo": true,
          "label": "Initializing rtk in repo" }
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
        { "type": "claude-prompt",
          "label": "Trigger automation recommender",
          "value": "Ask Claude in this repo: \"recommend automations for this project\"" }
      ]
    }
  ]
}
```

## 7. Catalog Loading

Source: `https://raw.githubusercontent.com/<owner>/auto-claude/main/catalog.json` (exact owner/repo finalized at first publish).

Fallback chain:
1. Remote fetch (5s timeout) → validate with zod → write to cache.
2. On network failure: read `~/.auto-claude/catalog.json` if present and not older than 7 days.
3. On any failure: load `bundled.json` from the package.

Cache TTL: 24h. Override with `auto-claude --refresh-catalog`.

## 8. Subcommands

| Command | Behavior |
|---|---|
| `auto-claude` | Default install wizard |
| `auto-claude status` | Plain stdout: each item's installed/missing + version |
| `auto-claude remove` | Wizard listing only installed items; runs `uninstall` |
| `auto-claude update [--only <id>]` | Runs `update` for installed items |
| `auto-claude --refresh-catalog` | Force re-fetch, ignore cache |

All subcommands share `engine/detect` and `engine/executor`. Only the install wizard uses full Ink interactivity.

## 9. Execution Engine

- All shell commands run via `execa` with captured stdout/stderr.
- Order: globals first → repo-aware tools → plugins. Within each group, catalog order preserved.
- Post-install actions run immediately after their parent item's install (not batched).
- A failed step halts execution. The UI shows: which item failed, exit code, last 10 lines of stderr.
- `cwd: 'repo-root'` items: executor resolves git root via `git rev-parse --show-toplevel`. If not in a repo and `requiresRepo` is true, the item is disabled with a tooltip in the wizard.

## 10. Error Handling

- Shell command failures: surface stderr tail + exit code, halt run.
- Catalog validation errors: fall back to cache → bundled. Log to `~/.auto-claude/errors.log`.
- Network timeouts: 5s for catalog fetch.
- Not-in-repo: repo-aware items disabled in selection; if any plugins selected, "this project" radio option hidden.

## 11. Testing

- **Unit (`engine/`):** vitest, mocked execa. Cover: detection state mapping, ordering, post-install sequencing, failure halt, scope rewriting for plugins.
- **Catalog loader:** mocked fetch + filesystem. Cover: TTL respect, fallback chain, malformed JSON handling.
- **UI:** `ink-testing-library` smoke tests for keyboard nav and rendering. No pixel snapshots.
- **End-to-end:** dry-run mode in engine that records commands instead of executing; assert command sequence matches a fixture for the canonical "all 4 items, project scope" flow.

## 12. Distribution

- npm package `auto-claude`, `bin: { "auto-claude": "./dist/cli.js" }`.
- ESM, Node 20+ (Ink 5 requirement).
- Built with `tsup` into a single bundled `dist/cli.js`.
- Headline UX: `npx auto-claude`. `npm i -g auto-claude` also supported.

## 13. Tech Stack

- TypeScript 5.x, ESM
- Ink 5 (TUI)
- zod (catalog validation)
- execa (subprocess)
- commander (argv parsing)
- vitest + ink-testing-library (tests)
- tsup (build)

## 14. Open Items to Verify During Implementation

1. **rtk install command** — exact npm/cargo/shell installer per [rtk-ai/rtk](https://github.com/rtk-ai/rtk) docs.
2. **`rtk init -g` semantics** — user described it as both `-g` (global) and "at repo level". Verify which is correct; spec currently treats it as a repo-level post-install action requiring a git repo.
3. **`claude plugin` project-scope mechanism** — whether `claude plugin install` is cwd-sensitive, takes a `--project` flag, or requires a different invocation. Adjust executor accordingly.
4. **`claude plugin list` parse format** — for accurate detection of installed plugins (regex vs JSON output).
5. **Catalog hosting URL** — finalize owner/repo path for `catalog.json`.

## 15. Out of Scope (Explicit YAGNI)

- Plugin authoring / catalog editing UI.
- Auto-update of auto-claude itself.
- Multi-version tool management.
- Rollback on partial install failure.
- Non-Claude tools or general dev environment setup.
