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

- **claude-mem** — persistent cross-session memory plugin
- **rtk** — token-optimized CLI proxy (also runs `rtk init -g` in the repo)
- **superpowers** — Claude Code skills framework plugin
- **claude-code-setup** — automation recommender plugin

## Requirements

- Node.js 20+
- `claude` CLI (for plugin install)
- `git` (for project-scoped operations)
