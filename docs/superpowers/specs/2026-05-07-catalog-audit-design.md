# Catalog audit — 11 groups

**Date:** 2026-05-07
**Branch:** `baoduy/fomalhaut`
**Scope:** Audit and fix the 11 most recently added catalog groups (32 items total). Other groups are out of scope.

Target groups: `agent-orchestration`, `language-lsp`, `code-review`, `git-workflow`, `browser-testing`, `infra-pulumi`, `cloudflare`, `mcp-azure`, `infra-mcp`, `mcp-search`, `mcp-rust-docs`.

## Goal

Make every item in these 11 groups install correctly out of the box, or — when configuration is unavoidable — show the user a clear post-install prompt explaining what they must do. Replace silent failures with explicit guidance.

## Approach

Tiered audit:

- **Workstream 1 — Definite bugs.** Fixes that need no research. Land first.
- **Workstream 2 — Upstream verification.** Targeted Context7/WebFetch lookups for items that are suspected stale or unverified. Patch `catalog.json` from upstream sources.
- **Workstream 3 — Schema extension.** Add `postInstall?: PostInstallAction[]` to `McpItem` and wire it through the executor so MCPs can carry "set this env var" / "run `az login`" prompts.
- **Workstream 4 — Tests + findings doc.** New tests cover the renamed plugin and MCP-with-postInstall. Findings doc records per-item status.

## Workstream 1 — Definite bugs

| # | Item | Fix |
|---|------|-----|
| 1.1 | `k8s-security-policies` | The catalog's `id`, `install`, and `uninstall` disagree (catalog id ≠ installed plugin name). Detection via `claude plugin list` will never match. **Rename catalog id to `kubernetes-operations`** so it matches the actual plugin from `wshobson/agents`. Update `id`, `name`, `description`. |
| 1.2 | `ralph-wiggum` marketplace | Sibling Anthropic plugins (`mcp-server-dev`, `feature-dev`, `code-review`, `pr-review-toolkit`) install from `claude-plugins-official`, but `ralph-wiggum` adds a different marketplace `claude-code-plugins` from `anthropics/claude-code`. One is wrong. Resolve in W2 by upstream check. |

## Workstream 2 — Upstream verification

For each item below, do a one-shot upstream lookup (Context7 first, WebFetch on miss) and confirm: marketplace name, plugin/package id, required env vars, prerequisites. Patch `catalog.json` with corrections. Each lookup result is recorded in the findings doc.

**Plugins to verify (membership in `claude-plugins-official`):**
`mcp-server-dev`, `feature-dev`, `code-review`, `pr-review-toolkit`, `claude-md-management`, `csharp-lsp`, `typescript-lsp`, `pyright-lsp`, `github`, `commit-commands`, `playwright`.

**Plugins to verify (marketplace add command):**
`ralph-wiggum`, `rust-lsp`, `pulumi-authoring`, `pulumi-migration`, `cloudflare`, `kubernetes-operations`.

**MCPs to verify (npm package name correctness):**
`microsoft-mcp-catalog`, `exa-mcp`, `azure-devops-mcp`, `m365-agents-mcp`, `omnisearch-mcp`, `kubernetes-mcp`, `mcp-docsrs`, `browser-mcp`.

For any unverifiable item: leave as-is, flag in the findings doc as "needs upstream confirmation", and don't fail the audit.

## Workstream 3 — MCP postInstall support

### Schema change

`src/types.ts`:

```ts
export interface McpItem extends BaseCatalogItem {
  kind: 'mcp';
  mcpKey: string;
  mcpServer: McpServerConfig;
  postInstall?: PostInstallAction[];  // NEW
}
```

`src/catalog/schema.ts` — extend the MCP item zod schema with the same optional field.

### Executor change

`src/engine/executor.ts` — after writing an MCP entry to `.mcp.json`, walk `item.postInstall` and dispatch each action through the existing `runShellAction` / `emitPromptAction` helpers used for `tool` / `plugin` items. Keep `dryRun` and `record` paths working.

### Catalog edits — add post-install prompts

| Item | Post-install prompt (claude-prompt or shell) |
|------|---|
| `tavily-mcp` | claude-prompt: "Set `TAVILY_API_KEY` from https://app.tavily.com before using this MCP." |
| `brave-mcp` | claude-prompt: "Set `BRAVE_API_KEY` from https://api.search.brave.com before using this MCP." |
| `exa-mcp` | claude-prompt: "Set `EXA_API_KEY` from https://dashboard.exa.ai before using this MCP." |
| `omnisearch-mcp` | claude-prompt: list the provider keys from upstream README (Tavily, Brave, Exa, Perplexity, etc.) |
| `cloudflare-mcp` | claude-prompt: "First run opens a browser for Cloudflare OAuth." |
| `azure-mcp` | claude-prompt: "Run `az login` first." |
| `docker-mcp-toolkit` | claude-prompt: "Requires Docker Desktop with the `docker mcp` extension." |
| `rust-docs-govcraft` | claude-prompt: "Install binary first: `cargo install rust-docs-mcp-server`." |
| `rust-docs-snowmead` | claude-prompt: "Install binary first: `cargo install --git https://github.com/snowmead/rust-docs-mcp`." |

### Env placeholder note

Claude Code's `.mcp.json` env-substitution behavior is not assumed. The catalog stores env *names* via the post-install prompt rather than literal `${VAR}` strings inside `mcpServer.env`. This avoids shipping a `.mcp.json` whose env values are literal placeholder strings. If verification confirms `.mcp.json` expands `${VAR}`, we revisit and add `env` fields directly.

## Workstream 4 — Tests + findings

- `tests/catalog/catalog-json.test.ts` — add a parameterized check that every item with `kind: 'plugin'` whose `install.command` references a marketplace has an `id` that matches the installed plugin name (catches W1.1-style bugs going forward).
- `tests/engine/executor.test.ts` — new test: MCP item with a shell `postInstall` records the command in dry-run.
- Findings doc: `docs/superpowers/specs/2026-05-07-catalog-audit-findings.md` — per-item table (status, change, source consulted).

## Sequence

1. Workstream 3 — schema + executor (unblocks W2 edits that add `postInstall` to MCPs).
2. Workstream 1 — definite-bug fixes.
3. Workstream 2 — upstream verification → catalog edits.
4. Workstream 4 — tests + findings doc.
5. `pnpm typecheck && pnpm test && pnpm build`.

## Risks

- **Network-dependent verification.** Budget ~30 lookups. Unverifiable items are documented, not blockers.
- **Schema/executor change is additive but real.** `McpItem.postInstall` is optional, so existing MCPs are unaffected. New executor branch is covered by a new test.
- **`.mcp.json` env expansion semantics** are not assumed (see Workstream 3 note).

## Out of scope

The other 9 catalog groups (memory, spec, code-intelligence, docs, context-optimization, core-plugins, visual, project-templates, mcp-servers). Audited in prior sessions.
