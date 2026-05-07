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
| `npx auto-claude default` | Silently install all `default: true` items globally (for fleet automation) |
| `npx auto-claude default --list` (or `-l`) | List default items and their installed state |
| `npx auto-claude --refresh-catalog` | Bypass the 24h catalog cache |

### Fleet automation

`npx auto-claude default` is non-interactive — no prompts, no TTY required, idempotent. Use it from a bash script to provision every machine in your company:

```bash
npx -y auto-claude default
```

Items shipped to every device are flagged `"default": true` in `catalog.json`. The command runs detection first and skips anything already installed, continues past per-item failures, and exits `0` on success, `1` on partial failure, or `2` on catalog load failure.

## What it installs

The catalog is fetched at runtime; the root `catalog.json` ships with the npm package as the offline fallback:

**Tools**
- **rtk** — token-optimized CLI proxy (also runs `rtk init -g` in the repo)
- **graphify** — knowledge-graph builder for your codebase, surfaced via `/graphify`
- **gitnexus** — code-intelligence MCP server; indexes your repo into a graph

**Plugins**
- **claude-mem** — persistent cross-session memory
- **superpowers** — skills framework
- **claude-code-setup** — automation recommender
- **microsoft-docs** — Microsoft / Azure / .NET docs and samples
- **context7** — version-specific library docs pulled into LLM context
- **plugin-dev** — toolkit for developing Claude Code plugins
- **drunk-app** — assistant for configuring drunk-app Helm chart deployments
- **dknet-minimal** — vertical-slice features on DKNet.Minimal.Template (.NET 10)

## Requirements

- Node.js 20+
- `claude` CLI (for plugin install)
- `git` (for project-scoped operations)
- `pip` (for graphify) and Homebrew (for rtk on macOS)

## Releases

Releases are published automatically by `.github/workflows/npm-publish.yaml`:

- Pushes to `main` (or manual `workflow_dispatch`) compute the next version from
  the commit log via [`paulhatch/semantic-version`](https://github.com/PaulHatch/semantic-version).
  Use `(MAJOR)` / `(MINOR)` in commit subjects to bump major/minor; otherwise patch.
- The workflow runs `pnpm typecheck && pnpm test && pnpm build`, updates
  `package.json`, creates a tagged GitHub Release, and publishes to npm.

**Required secret:** `NPM_TOKEN` — npm automation token with **Publish** permission.
Add it under *Settings → Secrets and variables → Actions* on the GitHub repo.
