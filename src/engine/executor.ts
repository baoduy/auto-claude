import type { CatalogItem, EngineEvent, InstallPlan, PostInstallAction } from '../types.js';
import { orderForInstall } from './ordering.js';

export interface RichRunResult { exitCode: number; stdout: string; stderr: string }
export type RichRunner = (cmd: string, opts?: { cwd?: string }) => Promise<RichRunResult>;

export interface ExecuteOptions {
  run: RichRunner;
  onEvent: (e: EngineEvent) => void;
  dryRun: boolean;
  /** Called for each command in dryRun mode. */
  record?: (cmd: string) => void;
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
  const items = orderForInstall(plan.selected);
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const cwd = resolveCwd(item, plan);
    opts.onEvent({ type: 'item-start', itemId: item.id, label: item.name, index: i + 1, total });

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
