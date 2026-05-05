import type { CatalogItem, EngineEvent, InstallState } from '../types.js';
import { detectStates, realShellRunner } from '../engine/detect.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { findRepoRoot } from '../engine/project.js';
import { executeInstall } from '../engine/executor.js';
import { orderForInstall } from '../engine/ordering.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';
import { flattenItems } from '../catalog/groups.js';

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
  const defaults = flattenItems(catalog).filter((i) => i.default === true);
  const repoRoot = await findRepoRoot();
  const states = await detectStates(defaults, undefined, repoRoot);
  process.stdout.write(printHeader('default --list'));
  process.stdout.write(renderDefaultList(catalog, states));
}

export function renderDefaultList(catalog: import('../types.js').Catalog, states: InstallState[]): string {
  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  let any = false;
  for (const g of catalog.groups) {
    const defaults = g.items.filter((i) => i.default === true);
    if (defaults.length === 0) continue;
    any = true;
    if (lines.length > 0) lines.push('');
    lines.push(paint(`${g.name}:`, 'group'));
    for (const it of defaults) lines.push(formatRow(it, stateById.get(it.id)));
  }
  if (!any) lines.push('No items are flagged as defaults.');
  return lines.join('\n') + '\n';
}

function formatRow(item: CatalogItem, state: InstallState | undefined): string {
  const installed = !!state?.installed;
  const status = installed
    ? paint(`${GLYPHS.ok} installed`, 'ok')
    : paint(`${GLYPHS.missing} not installed`, 'dim');
  const kindGlyph = item.kind === 'tool'
    ? paint(GLYPHS.tool, 'tool')
    : paint(GLYPHS.plugin, 'plugin');
  const sep = process.stdout.isTTY ? '  ' : '\t';
  // Pad id to 14 chars only when TTY, for clean alignment.
  const id = process.stdout.isTTY ? item.id.padEnd(14) : item.id;
  return `  ${kindGlyph} ${id}${sep}${status}`;
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
      deps.log(paint(`${GLYPHS.recycle} ${item.id} already installed`, 'dim'));
      result.skipped++;
      result.ok++;
      continue;
    }

    deps.log(paint(`${GLYPHS.arrow} ${item.id}`, 'cursor'));

    // Wrap onEvent so post-prompt becomes a one-line notice (no human to read prompts on a fleet device).
    const wrappedOnEvent = (e: EngineEvent) => {
      if (e.type === 'post-prompt') {
        deps.log(paint(`${GLYPHS.info} ${e.itemId}: post-install Claude prompt skipped (run \`auto-claude\` interactively to see it)`, 'info'));
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
      deps.log(paint(`${GLYPHS.ok} ${item.id}`, 'ok'));
      result.ok++;
    } catch (e) {
      deps.err(paint(`${GLYPHS.fail} ${item.id}: ${(e as Error).message}`, 'fail'));
      result.failed++;
    }
  }

  const summaryColor = result.failed > 0 ? 'fail' : 'ok';
  deps.log(paint(`default: ${result.ok} ok, ${result.failed} failed, ${result.skipped} skipped`, summaryColor));
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

  const defaults = flattenItems(catalog).filter((i) => i.default === true);

  process.stdout.write(printHeader('default'));

  const repoRoot = await findRepoRoot();

  const richRun: RunDefaultInstallDeps['run'] = async (cmd) => {
    return realShellRunner(cmd);
  };

  const result = await runDefaultInstall({
    items: defaults,
    detect: (items) => detectStates(items, undefined, repoRoot),
    run: richRun,
    log: (m) => process.stdout.write(m + '\n'),
    err: (m) => process.stderr.write(m + '\n'),
    onEvent: () => { /* progress already logged via per-item log() calls */ },
  });

  if (result.failed > 0) process.exitCode = 1;
}
