# auto-claude

Curated installer and lifecycle manager for Claude Code tools and plugins. Ships as a single `npx auto-claude` command that drives an Ink-based TUI wizard for selecting, installing, updating, and removing items from a versioned catalog.

## Purpose

Claude Code is most useful with a stack of supporting tools (rtk, gitnexus, graphify) and plugins (claude-mem, superpowers, context7, …). Installing them by hand means juggling Homebrew, pip, `claude plugin`, MCP config, post-install prompts, and ordering constraints. auto-claude collapses all of that into one interactive flow driven by a declarative catalog.

## Commands

| Command | Behavior |
|---|---|
| `npx auto-claude` | Interactive install wizard (default action) |
| `npx auto-claude status` | Show installed/missing state per catalog item |
| `npx auto-claude remove [--yes]` | Uninstall installed items |
| `npx auto-claude update [--only <id>]` | Update installed items |
| `npx auto-claude --refresh-catalog` | Bypass the 24h catalog cache |

## Architecture

```
src/
  cli.ts              Commander entrypoint → dispatches to commands/
  types.ts            Catalog / InstallPlan / EngineEvent types
  catalog/
    loader.ts         Fetch + cache (24h) remote catalog, fall back to bundled
    schema.ts         Zod schema for catalog validation
  (root)
    catalog.json      Single source of truth — bundled into npm package and
                      served via the remote raw GitHub URL
  engine/
    detect.ts         Probe whether each item is already installed
    executor.ts       Run install / uninstall / update + post-install actions
    ordering.ts       Topological-ish ordering (tools before plugins, etc.)
    project.ts        Resolve repo root for project-scoped operations
  commands/
    install.tsx       Mounts the Ink App for the install wizard
    status.ts         Plain-text status report
    remove.ts         Uninstall flow
    update.ts         Update flow
  ui/
    App.tsx           Wizard state machine: select → scope → confirm → run → done
    ItemList.tsx      Tools/Plugins checklist (↑↓ navigate, space toggle, enter continue, q quit)
    PluginScopePrompt.tsx   Global vs project scope picker
    ConfirmSummary.tsx      Pre-flight install plan
    ProgressLog.tsx         Streaming engine events
    PostInstallPanel.tsx    Final shell-output / prompt-for-Claude messages
tests/
  catalog/  engine/  commands/  ui/  e2e/
```

### Data model (see `src/types.ts`)

- **CatalogItem** — `kind: 'tool' | 'plugin'`, `detect`, `install`, optional `uninstall`/`update`/`postInstall`, `defaultScope`.
- **InstallPlan** — selected items + chosen `pluginScope` (`global` or `project`) + `repoRoot`.
- **EngineEvent** — `item-start | item-success | item-failure | post-shell-* | post-prompt | done` streamed from executor to UI.
- **PostInstallAction** — `shell` (run a command) or `claude-prompt` (text the user pastes into Claude).

### Wizard flow (`ui/App.tsx`)

`select` → (if any plugin AND repo present) `scope` → `confirm` → `run` → `done`. Already-installed items are pre-checked and locked (space is a no-op on them). Pressing enter with no new selections exits cleanly.

### Catalog

Fetched at runtime, cached for 24h; `--refresh-catalog` forces a refetch. The root `catalog.json` is bundled into the npm package and used as the offline fallback so the tool works offline.

## Development

```bash
pnpm install
pnpm dev          # tsup --watch
pnpm build        # produce dist/
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
pnpm start        # run dist/cli.js
```

Stack: TypeScript (ESM), tsup, Ink 5 + React 18, Commander, Zod, execa, vitest + ink-testing-library.

## Conventions

- **ESM only.** Every relative import ends in `.js` (TS resolves to `.ts`, emit stays valid ESM).
- **No side effects at import.** Commands are invoked from `cli.ts` actions, never run on module load.
- **Engine talks via events**, never to the UI directly. Anything the user should see goes through `EngineEvent`.
- **Never mutate the catalog at runtime.** Treat `Catalog` as frozen input.
- **Tests live next to features** under `tests/<area>/…`. E2E tests in `tests/e2e/` exercise the CLI binary.
- Use `execa` for subprocesses; surface stderr tail on failure (see `executor.ts`).

## Adding a new tool/plugin

1. Add an entry to `catalog.json` at the repo root (validated by `src/catalog/schema.ts`).
2. Specify `detect` (how to know it's installed), `install`, ideally `uninstall` + `update`.
3. If the user must run something or tell Claude something afterward, add `postInstall` actions.
4. If it's a plugin needing the `claude` CLI, set `kind: 'plugin'` and a sane `defaultScope`.
5. Add tests under `tests/catalog/` and, if the install path is non-trivial, `tests/engine/`.

## Requirements (runtime, on the user's machine)

- Node.js 20+
- `claude` CLI (for plugin install)
- `git` (for project-scoped operations)
- `pip` (for graphify), Homebrew (for rtk on macOS)

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **auto-claude** (765 symbols, 828 relationships, 3 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/auto-claude/context` | Codebase overview, check index freshness |
| `gitnexus://repo/auto-claude/clusters` | All functional areas |
| `gitnexus://repo/auto-claude/processes` | All execution flows |
| `gitnexus://repo/auto-claude/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
