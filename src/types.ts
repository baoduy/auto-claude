export type Scope = 'global' | 'project';
export type ItemKind = 'tool' | 'plugin' | 'mcp';
export type Cwd = 'repo-root' | 'cwd';

export interface PostInstallAction {
  type: 'shell' | 'claude-prompt';
  value: string;
  requiresRepo?: boolean;
  label?: string;
  /** If true, defer until after the Ink wizard exits and run with the real TTY. */
  interactive?: boolean;
}

export interface CommandSpec {
  command: string;
  cwd?: Cwd;
}

/** Shell-based detect: run a command, optionally regex its stdout. */
export interface ShellDetectSpec {
  kind?: 'shell';
  command: string;
  /** Regex applied to stdout. If absent, exit-code 0 == installed. */
  versionMatch?: string;
}

/** npm-based detect: probe `<pm> ls -g <package>` (npm preferred, pnpm fallback).
 *  Avoids running the package's own binary, which can hang. */
export interface NpmDetectSpec {
  kind: 'npm';
  /** Full npm package name (e.g. "@fission-ai/openspec"). */
  package: string;
}

export type DetectSpec = ShellDetectSpec | NpmDetectSpec;

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface BaseCatalogItem {
  id: string;
  name: string;
  description: string;
  homepage?: string;
  /** When true, included by `auto-claude default` (silent fleet install). */
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
  /** Key under which the server is written into .mcp.json's mcpServers. */
  mcpKey: string;
  mcpServer: McpServerConfig;
  /**
   * Optional post-install actions (typically `claude-prompt` instructions
   * telling the user to set an API key or run an auth command).
   */
  postInstall?: PostInstallAction[];
}

export type CatalogItem = ToolItem | PluginItem | McpItem;

export function isMcpItem(item: CatalogItem): item is McpItem {
  return item.kind === 'mcp';
}

export function isShellItem(item: CatalogItem): item is ToolItem | PluginItem {
  return item.kind === 'tool' || item.kind === 'plugin';
}

export type GroupKind = 'pick-one' | 'pick-many';

export interface CatalogGroup {
  id: string;
  name: string;
  description?: string;
  kind: GroupKind;
  /** Optional override for which kind-page this group renders on in the wizard.
   *  Defaults to the dominant kind among items (tool > plugin > mcp tiebreak). */
  page?: ItemKind;
  items: CatalogItem[];
}

export interface Catalog {
  version: 2;
  updatedAt: string;
  groups: CatalogGroup[];
}

export interface InstallState {
  itemId: string;
  installed: boolean;
  version?: string;
}

/** User selections + scope choice produced by the wizard.
 *  `scope` applies to both plugins (controls cwd of `claude plugin install`)
 *  and MCP servers (controls which config file is written:
 *  `~/.claude.json` for global, `<repoRoot>/.mcp.json` for project). */
export interface InstallPlan {
  selected: CatalogItem[];
  /** Items the user unchecked that were previously installed. Run before `selected`. */
  uninstall?: CatalogItem[];
  scope: Scope;
  repoRoot: string | null;
}

export type Phase = 'install' | 'uninstall';

/** Engine event types for streaming progress to the UI. */
export type EngineEvent =
  | { type: 'item-start'; itemId: string; label: string; index: number; total: number; phase?: Phase }
  | { type: 'item-success'; itemId: string }
  | { type: 'item-failure'; itemId: string; exitCode: number; stderrTail: string }
  | { type: 'post-shell-start'; itemId: string; label: string }
  | { type: 'post-shell-success'; itemId: string }
  | { type: 'post-shell-failure'; itemId: string; exitCode: number; stderrTail: string }
  | { type: 'post-shell-deferred'; itemId: string; label: string }
  | { type: 'post-prompt'; itemId: string; label: string; value: string }
  | { type: 'done' };

/** Post-install actions that need a real TTY — run after Ink unmounts. */
export interface DeferredInteractive {
  itemId: string;
  itemName: string;
  label: string;
  command: string;
  cwd?: string;
}
