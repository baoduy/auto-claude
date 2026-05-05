export type Scope = 'global' | 'project';
export type ItemKind = 'tool' | 'plugin';
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

export interface DetectSpec {
  command: string;
  /** Regex applied to stdout. If absent, exit-code 0 == installed. */
  versionMatch?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  homepage?: string;
  defaultScope: Scope;
  detect: DetectSpec;
  install: CommandSpec;
  uninstall?: CommandSpec;
  update?: CommandSpec;
  postInstall?: PostInstallAction[];
  /** When true, included by `auto-claude default` (silent fleet install). */
  default?: boolean;
}

export type GroupKind = 'pick-one' | 'pick-many';

export interface CatalogGroup {
  id: string;
  name: string;
  description?: string;
  kind: GroupKind;
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

/** User selections + plugin scope choice produced by the wizard. */
export interface InstallPlan {
  selected: CatalogItem[];
  /** Items the user unchecked that were previously installed. Run before `selected`. */
  uninstall?: CatalogItem[];
  pluginScope: Scope;
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
