# @drunkcoding/auto-claude

Curated installer and lifecycle manager for Claude Code tools and plugins.

## Quick start

```bash
npx @drunkcoding/auto-claude
```

Pick the tools and plugins you want from the checklist; @drunkcoding/auto-claude installs them in the right order, runs any required post-install steps, and prints any final instructions you need to give to Claude itself.

## Commands

| Command | What it does |
|---|---|
| `npx @drunkcoding/auto-claude` | Interactive install wizard (default) |
| `npx @drunkcoding/auto-claude status` | Show installed/missing state |
| `npx @drunkcoding/auto-claude remove [--yes]` | Uninstall installed items |
| `npx @drunkcoding/auto-claude update [--only <id>]` | Update installed items |
| `npx @drunkcoding/auto-claude --refresh-catalog` | Bypass the 24h catalog cache |

### Wizard flow

After you confirm, the wizard exits and each install/uninstall/post-install command runs in your real terminal with inherited stdio. You can answer any prompts (sudo password, "trust this marketplace?", API-key questions) directly. On failure, you'll be asked `[c]ontinue / [a]bort?`.

## What it installs

The catalog is fetched at runtime; the root `catalog.json` ships with the npm package as the offline fallback:

**Current catalog groups in `catalog.json`:**
- **Memory backend** (`pick-one`): `claude-mem`, `cavemem`, `mempalace`
- **Spec-driven workflow** (`pick-one`): `spec-kit`, `open-spec`
- **Code intelligence / KG** (`pick-one`): `gitnexus`, `graphify`
- **Documentation providers** (`pick-many`): `context7`, `microsoft-docs`
- **Context & token optimization** (`pick-many`): `rtk`, `context-mode`, `codeburn`
- **Core plugins & skill packs** (`pick-many`): `superpowers`, `claude-code-setup`, `plugin-dev`, `caveman`, `microsoft/skills`, `microsoft/azure-skills`
- **Visual tooling** (`pick-many`): `snip`
- **Project-specific templates** (`pick-many`): `drunk-app`, `dknet-minimal`
- **MCP servers (project)** (`pick-many`): `context7-mcp`, `microsoft-learn-mcp`
- **Agent orchestration & authoring** (`pick-many`): `mcp-server-dev`, `ralph-wiggum`, `feature-dev`, `claude-md-management`
- **Language LSPs** (`pick-many`): `csharp-lsp`, `typescript-lsp`, `pyright-lsp`, `rust-lsp`
- **Code review** (`pick-many`): `code-review`, `pr-review-toolkit`
- **Git / VCS workflow** (`pick-many`): `github`, `commit-commands`
- **Browser testing & automation** (`pick-many`): `playwright`, `browser-mcp`
- **Pulumi authoring & migration** (`pick-many`): `pulumi-authoring`, `pulumi-migration`
- **Cloudflare** (`pick-many`): `cloudflare`, `cloudflare-mcp`
- **Microsoft / Azure MCPs** (`pick-many`): `azure-mcp`, `azure-devops-mcp`, `microsoft-mcp-catalog`, `m365-agents-mcp`
- **Container / orchestration runtime** (`pick-many`): `kubernetes-mcp`, `docker-mcp-toolkit`, `kubernetes-operations`
- **Web search MCPs** (`pick-many`): `tavily-mcp`, `exa-mcp`, `brave-mcp`, `omnisearch-mcp`
- **Rust docs.rs MCPs** (`pick-many`): `rust-docs-govcraft`, `rust-docs-snowmead`, `mcp-docsrs`

### Hiding items

Set `"disabled": true` on a catalog item to remove it from every command surface (wizard, status, update, remove). Set it on a group to hide the whole group. Empty groups left over after item filtering are also dropped.

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
