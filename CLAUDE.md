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
| `npx auto-claude default` | Silently install all `default: true` items globally (for fleet automation) |
| `npx auto-claude default --list` (or `-l`) | List default items and their installed state |
| `npx auto-claude --refresh-catalog` | Bypass the 24h catalog cache |

## Architecture

```
src/
  cli.ts              Commander entrypoint → dispatches to commands/
  types.ts            Catalog / InstallPlan / EngineEvent types
  catalog/
    bundled.json      Fallback catalog shipped in the npm package
    loader.ts         Fetch + cache (24h) remote catalog, fall back to bundled
    schema.ts         Zod schema for catalog validation
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

Fetched at runtime, cached for 24h; `--refresh-catalog` forces a refetch. `src/catalog/bundled.json` is the shipped fallback so the tool works offline.

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

1. Add an entry to `src/catalog/bundled.json` (validated by `src/catalog/schema.ts`).
2. Specify `detect` (how to know it's installed), `install`, ideally `uninstall` + `update`.
3. If the user must run something or tell Claude something afterward, add `postInstall` actions.
4. If it's a plugin needing the `claude` CLI, set `kind: 'plugin'` and a sane `defaultScope`.
5. Add tests under `tests/catalog/` and, if the install path is non-trivial, `tests/engine/`.

## Requirements (runtime, on the user's machine)

- Node.js 20+
- `claude` CLI (for plugin install)
- `git` (for project-scoped operations)
- `pip` (for graphify), Homebrew (for rtk on macOS)
