import { execa } from 'execa';
import { createInterface } from 'node:readline/promises';
import type { CatalogItem, InstallPlan, McpItem, PostInstallAction } from '../types.js';
import { isShellItem } from '../types.js';
import { orderForInstall, orderForUninstall } from './ordering.js';

export interface StreamCommand {
  itemId: string;
  itemName: string;
  label: string;
  command: string;
  cwd?: string;
}

export interface StreamOptions {
  runShell?: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number }>;
  onFailure?: (ctx: { itemId: string; label: string; exitCode: number }) => Promise<'continue' | 'abort'>;
  write?: (s: string) => void;
  mcpInstall?: (item: McpItem, plan: InstallPlan) => Promise<void>;
  mcpUninstall?: (item: McpItem, plan: InstallPlan) => Promise<void>;
}

export interface StreamResult {
  succeeded: string[];
  failed: string[];
  claudePrompts: Array<{ label: string; value: string }>;
}

const defaultRunShell: NonNullable<StreamOptions['runShell']> = async (cmd, opts) => {
  const r = await execa(cmd, { shell: true, reject: false, stdio: 'inherit', cwd: opts?.cwd });
  return { exitCode: r.exitCode ?? 1 };
};

const defaultOnFailure: NonNullable<StreamOptions['onFailure']> = async ({ label, exitCode }) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`\n✗ ${label} failed (exit ${exitCode}). [c]ontinue / [a]bort? `)).trim().toLowerCase();
    return ans.startsWith('c') ? 'continue' : 'abort';
  } finally {
    rl.close();
  }
};

function resolveCwd(item: CatalogItem, plan: InstallPlan): string | undefined {
  if (item.kind === 'mcp') return undefined;
  if (item.install.cwd === 'repo-root' && plan.repoRoot) return plan.repoRoot;
  if (item.kind === 'plugin' && plan.scope === 'project' && plan.repoRoot) return plan.repoRoot;
  return undefined;
}

export async function streamInstall(plan: InstallPlan, opts: StreamOptions = {}): Promise<StreamResult> {
  const runShell = opts.runShell ?? defaultRunShell;
  const onFailure = opts.onFailure ?? defaultOnFailure;
  const write = opts.write ?? ((s: string) => process.stdout.write(s));
  const result: StreamResult = { succeeded: [], failed: [], claudePrompts: [] };

  const uninstalls = orderForUninstall((plan.uninstall ?? []).filter((i) => i.kind === 'mcp' || (isShellItem(i) && i.uninstall)));
  const installs = orderForInstall(plan.selected);
  const total = uninstalls.length + installs.length;
  let step = 0;

  write(`\n▶ Running ${total} action${total === 1 ? '' : 's'}…\n`);

  for (const item of uninstalls) {
    step++;
    write(`\n── [${step}/${total}] Uninstall ${item.name} ──\n`);
    const { ok, exitCode } = await runOne(item, 'uninstall');
    if (!ok) {
      const choice = await onFailure({ itemId: item.id, label: `Uninstall ${item.name}`, exitCode });
      result.failed.push(item.id);
      if (choice === 'abort') return summarize(result, write);
      continue;
    }
    result.succeeded.push(item.id);
  }

  for (const item of installs) {
    step++;
    write(`\n── [${step}/${total}] ${item.name} ──\n`);
    const { ok, exitCode } = await runOne(item, 'install');
    if (!ok) {
      const choice = await onFailure({ itemId: item.id, label: item.name, exitCode });
      result.failed.push(item.id);
      if (choice === 'abort') return summarize(result, write);
      continue;
    }
    result.succeeded.push(item.id);
    for (const action of item.postInstall ?? []) {
      const postResult = await runPostInstall(item, action, result, runShell, onFailure, write, plan);
      if (postResult === 'abort') return summarize(result, write);
    }
  }

  return summarize(result, write);

  async function runOne(item: CatalogItem, phase: 'install' | 'uninstall'): Promise<{ ok: boolean; exitCode: number }> {
    if (item.kind === 'mcp') {
      try {
        if (phase === 'install' && opts.mcpInstall) await opts.mcpInstall(item, plan);
        if (phase === 'uninstall' && opts.mcpUninstall) await opts.mcpUninstall(item, plan);
        return { ok: true, exitCode: 0 };
      } catch (err: unknown) {
        write(`✗ ${(err as Error)?.message ?? err}\n`);
        return { ok: false, exitCode: 1 };
      }
    }
    const cmd = phase === 'install' ? item.install.command : item.uninstall!.command;
    const cwd = resolveCwd(item, plan);
    const r = await runShell(cmd, cwd ? { cwd } : undefined);
    return { ok: r.exitCode === 0, exitCode: r.exitCode };
  }
}

async function runPostInstall(
  item: CatalogItem,
  action: PostInstallAction,
  result: StreamResult,
  runShell: NonNullable<StreamOptions['runShell']>,
  onFailure: NonNullable<StreamOptions['onFailure']>,
  write: (s: string) => void,
  plan: InstallPlan,
): Promise<'continue' | 'abort'> {
  if (action.requiresRepo && !plan.repoRoot) return 'continue';
  if (action.type === 'claude-prompt') {
    result.claudePrompts.push({ label: action.label ?? '', value: action.value });
    return 'continue';
  }
  const label = action.label ?? action.value;
  write(`\n  → ${item.name}: ${label}\n`);
  const cwd = plan.repoRoot ?? undefined;
  const r = await runShell(action.value, cwd ? { cwd } : undefined);
  if (r.exitCode !== 0) {
    const choice = await onFailure({ itemId: item.id, label: `${item.name} post-install: ${label}`, exitCode: r.exitCode });
    if (choice === 'abort') return 'abort';
  }
  return 'continue';
}

function summarize(result: StreamResult, write: (s: string) => void): StreamResult {
  write(`\n── Summary ──\n`);
  write(`  ok:     ${result.succeeded.length}\n`);
  write(`  failed: ${result.failed.length}${result.failed.length ? ` (${result.failed.join(', ')})` : ''}\n`);
  if (result.claudePrompts.length > 0) {
    write(`\n  Tell Claude (paste these into your session):\n`);
    for (const p of result.claudePrompts) {
      write(`    • ${p.label}: ${p.value}\n`);
    }
  }
  return result;
}

export async function streamSimple(commands: StreamCommand[], opts: StreamOptions = {}): Promise<StreamResult> {
  const runShell = opts.runShell ?? defaultRunShell;
  const onFailure = opts.onFailure ?? defaultOnFailure;
  const write = opts.write ?? ((s: string) => process.stdout.write(s));
  const result: StreamResult = { succeeded: [], failed: [], claudePrompts: [] };
  const total = commands.length;
  write(`\n▶ Running ${total} action${total === 1 ? '' : 's'}…\n`);
  let step = 0;
  for (const c of commands) {
    step++;
    write(`\n── [${step}/${total}] ${c.label} ──\n`);
    const r = await runShell(c.command, c.cwd ? { cwd: c.cwd } : undefined);
    if (r.exitCode === 0) {
      result.succeeded.push(c.itemId);
    } else {
      result.failed.push(c.itemId);
      const choice = await onFailure({ itemId: c.itemId, label: c.label, exitCode: r.exitCode });
      if (choice === 'abort') break;
    }
  }
  return summarize(result, write);
}
