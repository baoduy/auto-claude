import type { CatalogItem, EngineEvent, InstallState } from '../types.js';
import { detectStates, realShellRunner } from '../engine/detect.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { executeInstall } from '../engine/executor.js';
import { orderForInstall } from '../engine/ordering.js';

export interface RunDefaultListOptions {
  refreshCatalog?: boolean;
}

export async function runDefaultList(opts: RunDefaultListOptions = {}): Promise<void> {
  let catalog;
  try {
    catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  } catch (err) {
    process.stderr.write(`error: failed to load catalog: ${(err as Error).message}\n`);
    process.exitCode = 2;
    return;
  }
  const defaults = catalog.items.filter((i) => i.default === true);
  const states = await detectStates(defaults);
  process.stdout.write(renderDefaultList(defaults, states));
}

export function renderDefaultList(items: CatalogItem[], states: InstallState[]): string {
  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const tools   = items.filter((i) => i.kind === 'tool');
  const plugins = items.filter((i) => i.kind === 'plugin');

  const lines: string[] = [];
  if (tools.length > 0) {
    lines.push('Default tools:');
    for (const it of tools) lines.push(formatRow(it, stateById.get(it.id)));
    lines.push('');
  }
  if (plugins.length > 0) {
    lines.push('Default plugins:');
    for (const it of plugins) lines.push(formatRow(it, stateById.get(it.id)));
    lines.push('');
  }
  if (lines.length === 0) lines.push('No items are flagged as defaults.', '');
  return lines.join('\n');
}

function formatRow(item: CatalogItem, state: InstallState | undefined): string {
  const status = state?.installed ? 'installed' : 'not installed';
  const sep = process.stdout.isTTY ? '  ' : '\t';
  // Pad id to 14 chars only when TTY, for clean alignment.
  const id = process.stdout.isTTY ? item.id.padEnd(14) : item.id;
  return `  ${id}${sep}${status}`;
}

export interface RunDefaultInstallDeps {
  items: CatalogItem[];
  detect: (items: CatalogItem[]) => Promise<InstallState[]>;
  run: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  log: (msg: string) => void;
  err: (msg: string) => void;
  onEvent: (e: EngineEvent) => void;
}

export interface DefaultInstallResult {
  ok: number;
  failed: number;
  skipped: number;
}

export async function runDefaultInstall(deps: RunDefaultInstallDeps): Promise<DefaultInstallResult> {
  const result: DefaultInstallResult = { ok: 0, failed: 0, skipped: 0 };
  if (deps.items.length === 0) {
    deps.log('default: nothing to do (no items flagged default: true)');
    return result;
  }

  const ordered = orderForInstall(deps.items);
  const states = await deps.detect(ordered);
  const installedIds = new Set(states.filter((s) => s.installed).map((s) => s.itemId));

  for (const item of ordered) {
    if (installedIds.has(item.id)) {
      deps.log(`↺ ${item.id} already installed`);
      result.skipped++;
      result.ok++;
      continue;
    }

    deps.log(`→ ${item.id}`);

    // Wrap onEvent so post-prompt becomes a one-line notice (no human to read prompts on a fleet device).
    const wrappedOnEvent = (e: EngineEvent) => {
      if (e.type === 'post-prompt') {
        deps.log(`ⓘ ${e.itemId}: post-install Claude prompt skipped (run \`auto-claude\` interactively to see it)`);
        return;
      }
      deps.onEvent(e);
    };

    try {
      await executeInstall(
        { selected: [item], pluginScope: 'global', repoRoot: null },
        {
          run: deps.run,
          onEvent: wrappedOnEvent,
          dryRun: false,
        },
      );
      deps.log(`✓ ${item.id}`);
      result.ok++;
    } catch (e) {
      deps.err(`✗ ${item.id}: ${(e as Error).message}`);
      result.failed++;
    }
  }

  deps.log(`default: ${result.ok} ok, ${result.failed} failed, ${result.skipped} skipped`);
  return result;
}

export interface RunDefaultOptions {
  refreshCatalog?: boolean;
}

export async function runDefault(opts: RunDefaultOptions = {}): Promise<void> {
  let catalog;
  try {
    catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  } catch (err) {
    process.stderr.write(`error: failed to load catalog: ${(err as Error).message}\n`);
    process.exitCode = 2;
    return;
  }

  const defaults = catalog.items.filter((i) => i.default === true);

  const richRun: RunDefaultInstallDeps['run'] = async (cmd) => {
    return realShellRunner(cmd);
  };

  const result = await runDefaultInstall({
    items: defaults,
    detect: detectStates,
    run: richRun,
    log: (m) => process.stdout.write(m + '\n'),
    err: (m) => process.stderr.write(m + '\n'),
    onEvent: () => { /* progress already logged via per-item log() calls */ },
  });

  if (result.failed > 0) process.exitCode = 1;
}
