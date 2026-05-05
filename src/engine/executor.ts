import type { CatalogItem, DeferredInteractive, EngineEvent, InstallPlan, PostInstallAction } from '../types.js';
import { orderForInstall, orderForUninstall } from './ordering.js';

export interface RichRunResult { exitCode: number; stdout: string; stderr: string }
export type RichRunner = (cmd: string, opts?: { cwd?: string }) => Promise<RichRunResult>;

export interface ExecuteOptions {
  run: RichRunner;
  onEvent: (e: EngineEvent) => void;
  dryRun: boolean;
  /** Called for each command in dryRun mode. */
  record?: (cmd: string) => void;
  /** Collects interactive post-install actions to run after the wizard exits. */
  deferred?: DeferredInteractive[];
}

function resolveCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (item.install.cwd === 'repo-root' && plan.repoRoot) return plan.repoRoot;
  if (item.kind === 'plugin' && plan.pluginScope === 'project' && plan.repoRoot) return plan.repoRoot;
  return undefined;
}

function postCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (plan.repoRoot) return plan.repoRoot;
  return undefined;
}

const STDERR_TAIL_LINES = 10;
function tailStderr(s: string): string {
  return s.split('\n').slice(-STDERR_TAIL_LINES).join('\n');
}

export async function executeInstall(plan: InstallPlan, opts: ExecuteOptions): Promise<void> {
  const uninstalls = orderForUninstall((plan.uninstall ?? []).filter((i) => i.uninstall));
  const installs = orderForInstall(plan.selected);
  const total = uninstalls.length + installs.length;
  let stepIndex = 0;

  // Phase 1: uninstall unchecked items (skip those without an uninstall command — locked in UI)
  for (const item of uninstalls) {
    stepIndex++;
    const cwd = resolveCwd(item, plan);
    opts.onEvent({
      type: 'item-start', itemId: item.id, label: `Uninstall ${item.name}`,
      index: stepIndex, total, phase: 'uninstall',
    });
    if (opts.dryRun) {
      opts.record?.(item.uninstall!.command);
    } else {
      const r = await opts.run(item.uninstall!.command, cwd ? { cwd } : undefined);
      if (r.exitCode !== 0) {
        opts.onEvent({ type: 'item-failure', itemId: item.id, exitCode: r.exitCode, stderrTail: tailStderr(r.stderr) });
        throw new Error(`Uninstall failed for ${item.id} (exit ${r.exitCode})`);
      }
    }
    opts.onEvent({ type: 'item-success', itemId: item.id });
  }

  // Phase 2: install newly selected items
  for (const item of installs) {
    stepIndex++;
    const cwd = resolveCwd(item, plan);
    opts.onEvent({
      type: 'item-start', itemId: item.id, label: item.name,
      index: stepIndex, total, phase: 'install',
    });

    if (opts.dryRun) {
      opts.record?.(item.install.command);
    } else {
      const r = await opts.run(item.install.command, cwd ? { cwd } : undefined);
      if (r.exitCode !== 0) {
        opts.onEvent({ type: 'item-failure', itemId: item.id, exitCode: r.exitCode, stderrTail: tailStderr(r.stderr) });
        throw new Error(`Install failed for ${item.id} (exit ${r.exitCode})`);
      }
    }
    opts.onEvent({ type: 'item-success', itemId: item.id });

    for (const action of item.postInstall ?? []) {
      await runPostInstall(item, action, plan, opts);
    }
  }

  opts.onEvent({ type: 'done' });
}

async function runPostInstall(
  item: CatalogItem,
  action: PostInstallAction,
  plan: InstallPlan,
  opts: ExecuteOptions,
): Promise<void> {
  if (action.requiresRepo && !plan.repoRoot) return; // skip silently

  if (action.type === 'claude-prompt') {
    opts.onEvent({ type: 'post-prompt', itemId: item.id, label: action.label ?? '', value: action.value });
    return;
  }

  // shell
  const label = action.label ?? action.value;

  // Interactive shell actions can't run while Ink owns the TTY — defer them.
  if (action.interactive && opts.deferred && !opts.dryRun) {
    const cwd = postCwd(item, plan);
    opts.deferred.push({ itemId: item.id, itemName: item.name, label, command: action.value, cwd });
    opts.onEvent({ type: 'post-shell-deferred', itemId: item.id, label });
    return;
  }

  opts.onEvent({ type: 'post-shell-start', itemId: item.id, label });
  if (opts.dryRun) {
    opts.record?.(action.value);
  } else {
    const cwd = postCwd(item, plan);
    const r = await opts.run(action.value, cwd ? { cwd } : undefined);
    if (r.exitCode !== 0) {
      opts.onEvent({ type: 'post-shell-failure', itemId: item.id, exitCode: r.exitCode, stderrTail: tailStderr(r.stderr) });
      throw new Error(`Post-install failed for ${item.id} (exit ${r.exitCode})`);
    }
  }
  opts.onEvent({ type: 'post-shell-success', itemId: item.id });
}
