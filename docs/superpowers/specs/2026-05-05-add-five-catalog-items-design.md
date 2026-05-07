# Add five catalog items: context-mode, snip, codeburn, spec-kit, OpenSpec

**Date:** 2026-05-05
**Status:** Approved (ready to implement)

## Summary

Extend `src/catalog/bundled.json` with five new entries — three tools and two plugins — so they appear in the install wizard alongside the existing items. No code changes; this is purely a catalog addition validated by the existing Zod schema (`src/catalog/schema.ts`).

## Motivation

Each item is a popular Claude-Code-adjacent utility the user wants surfaced through `npx auto-claude`:

- **context-mode** — MCP server for context window optimization (~98% reduction)
- **snip** — visual mode (diagram rendering, annotated previews) for Claude Code
- **codeburn** — TUI dashboard for cross-tool token/cost observability
- **spec-kit** — GitHub's Spec-Driven Development toolkit (`/speckit.*` commands)
- **OpenSpec** — alternate spec-driven framework (`/opsx:*` commands)

## Categorization decisions

`kind` in the catalog is a UI grouping label, not a behavioral switch — the executor only cares about the `install` / `detect` / `uninstall` / `update` / `postInstall` strings. So categorization is a curation decision:

| Item | `kind` | `defaultScope` | Rationale |
|---|---|---|---|
| context-mode | `tool` | `global` | User preference; install via npm + `claude mcp add` rather than the marketplace plugin path |
| snip | `tool` | `global` | Standalone macOS app installed via Homebrew cask |
| codeburn | `tool` | `global` | Standalone npm CLI |
| spec-kit | `plugin` | `project` | Behaves as a per-repo plugin (drops `/speckit.*` slash commands into the repo via `specify init`), even though distribution is `uv tool install` |
| OpenSpec | `plugin` | `project` | Same pattern: per-repo plugin behavior via `openspec init`, distributed as a global npm CLI |

## Catalog entries

### context-mode (tool)

```json
{
  "id": "context-mode",
  "name": "context-mode",
  "description": "MCP server that sandboxes tool output and indexes session events — ~98% context reduction",
  "kind": "tool",
  "homepage": "https://github.com/mksglu/context-mode",
  "defaultScope": "global",
  "detect":    { "command": "context-mode --version" },
  "install":   { "command": "npm install -g context-mode" },
  "uninstall": { "command": "npm uninstall -g context-mode" },
  "update":    { "command": "npm install -g context-mode@latest" },
  "postInstall": [
    { "type": "shell", "value": "claude mcp add context-mode -- npx -y context-mode",
      "label": "Registering context-mode MCP server" }
  ]
}
```

### snip (tool)

```json
{
  "id": "snip",
  "name": "snip",
  "description": "Visual mode for Claude Code — render diagrams, annotate previews, OCR screenshots",
  "kind": "tool",
  "homepage": "https://github.com/rixinhahaha/snip",
  "defaultScope": "global",
  "detect":    { "command": "snip --version" },
  "install":   { "command": "brew install --cask rixinhahaha/snip/snip" },
  "uninstall": { "command": "brew uninstall --cask snip" },
  "update":    { "command": "brew upgrade --cask snip" },
  "postInstall": [
    { "type": "shell", "value": "snip setup", "label": "Wiring snip into Claude Code" }
  ]
}
```

macOS-only via Homebrew cask (matches the rtk precedent of leaving the platform requirement implicit).

### codeburn (tool)

```json
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
```

### spec-kit (plugin)

```json
{
  "id": "spec-kit",
  "name": "spec-kit",
  "description": "GitHub's Spec-Driven Development toolkit — /speckit.* slash commands for spec → plan → tasks → implement",
  "kind": "plugin",
  "homepage": "https://github.com/github/spec-kit",
  "defaultScope": "project",
  "detect":    { "command": "specify --version" },
  "install":   { "command": "uv tool install specify-cli --from git+https://github.com/github/spec-kit.git" },
  "uninstall": { "command": "uv tool uninstall specify-cli" },
  "update":    { "command": "uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git" },
  "postInstall": [
    { "type": "shell", "value": "specify init . --integration claude --force",
      "requiresRepo": true, "label": "Initializing spec-kit in repo (Claude integration)" }
  ]
}
```

Requires `uv` (Astral) on PATH; install fails loudly if missing — same precedent as graphify assuming `pip`.

### open-spec (plugin)

```json
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
    { "type": "shell", "value": "openspec init", "requiresRepo": true,
      "label": "Initializing OpenSpec in repo" }
  ]
}
```

## Implementation

1. Insert the five entries into `src/catalog/bundled.json` (preserve existing order; append at the end of `items`).
2. Bump `updatedAt` to `2026-05-05` (already current — no change needed).
3. Run `pnpm typecheck` and `pnpm test` — the Zod schema validates each new entry; existing detect/install/uninstall/update + post-install shape tests cover the new rows.

No source code changes. No new tests required (catalog validation is generic).

## Risks / Out of scope

- **No verification that the install commands actually work on a clean machine** — same risk profile as every other catalog entry. Smoke-testing belongs to the user installing each.
- **Linux snip users** are not served by the `brew --cask` install path. Out of scope; can be addressed later by branching `install.command` per platform if needed.
- **`uv` prerequisite for spec-kit** — not auto-installed; user-facing failure if missing.
