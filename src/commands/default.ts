import type { CatalogItem, EngineEvent, InstallState } from '../types.js';
import { isShellItem } from '../types.js';
import { detectStates, realShellRunner } from '../engine/detect.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { findRepoRoot } from '../engine/project.js';
import { executeInstall } from '../engine/executor.js';
import { orderForInstall } from '../engine/ordering.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';
import { flattenItems, findDefaultConflicts } from '../catalog/groups.js';

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
    : item.kind === 'mcp'
      ? paint(GLYPHS.mcp, 'mcp')
      : paint(GLYPHS.plugin, 'plugin');
  const sep = process.stdout.isTTY ? '  ' : '\t';
  // Pad id to 14 chars only when TTY, for clean alignment.
  const id = process.stdout.isTTY ? item.id.padEnd(14) : item.id;
  return `  ${kindGlyph} ${id}${sep}${status}`;
}

export interface RunDefaultInstallDeps {
  items: CatalogItem[];
  catalog?: import('../types.js').Catalog;
  repoRoot?: string | null;
  detect: (items: CatalogItem[]) => Promise<InstallState[]>;
  run: (cmd: string, opts?: { cwd?: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  log: (msg: string) => void;
  err: (msg: string) => void;
  onEvent: (e: EngineEvent) => void;
  dryRun?: boolean;
}

export interface DefaultInstallResult {
  ok: number;
  failed: number;
  skipped: number;
  conflicts: number;
}

export async function runDefaultInstall(deps: RunDefaultInstallDeps): Promise<DefaultInstallResult> {
  const result: DefaultInstallResult = { ok: 0, failed: 0, skipped: 0, conflicts: 0 };
  if (deps.items.length === 0) {
    deps.log('default: nothing to do (no items flagged default: true)');
    return result;
  }

  const ordered = orderForInstall(deps.items);
  const states = await deps.detect(ordered);
  const installedIds = new Set(states.filter((s) => s.installed).map((s) => s.itemId));

  const blockedDefaults = new Set<string>();
  const swapUninstalls: CatalogItem[] = [];
  const swapBatchDefaults = new Set<string>();

  if (deps.catalog) {
    const conflicts = findDefaultConflicts(deps.catalog, installedIds);
    for (const c of conflicts) {
      for (const sib of c.driftedSiblings) {
        if (isShellItem(sib) && sib.uninstall) {
          swapUninstalls.push(sib);
          swapBatchDefaults.add(c.defaultItem.id);
          deps.log(paint(
            `${GLYPHS.info} conflict in "${c.groupName}": ${sib.id} drift from default ${c.defaultItem.id}; uninstalling sibling`,
            'warn',
          ));
        } else {
          blockedDefaults.add(c.defaultItem.id);
          deps.log(paint(
            `${GLYPHS.info} conflict in "${c.groupName}": ${sib.id} installed but has no uninstall command; skipping ${c.defaultItem.id}`,
            'warn',
          ));
          result.conflicts++;
        }
      }
    }
  }

  if (swapUninstalls.length > 0) {
    const wrappedOnEventForSwap = (e: EngineEvent) => {
      if (e.type === 'post-prompt') return;
      deps.onEvent(e);
    };
    try {
      await executeInstall(
        { selected: [], uninstall: swapUninstalls, scope: 'global', repoRoot: deps.repoRoot ?? null },
        {
          run: deps.run,
          onEvent: wrappedOnEventForSwap,
          dryRun: !!deps.dryRun,
          record: deps.dryRun ? (cmd) => deps.log(paint(`  $ ${cmd}`, 'dim')) : undefined,
        },
      );
      for (const it of swapUninstalls) installedIds.delete(it.id);
    } catch (e) {
      deps.err(paint(`${GLYPHS.fail} swap-uninstall failed: ${(e as Error).message}`, 'fail'));
      result.failed++;
      // Block every default whose sibling we attempted to uninstall — invariant: never install a default while its conflicting sibling is on disk.
      for (const id of swapBatchDefaults) blockedDefaults.add(id);
    }
  }

  for (const item of ordered) {
    if (item.kind === 'mcp' && !deps.repoRoot) {
      deps.log(paint(`${GLYPHS.info} ${item.id}: skipped (MCP items require a project repo)`, 'dim'));
      result.skipped++;
      continue;
    }
    if (installedIds.has(item.id)) {
      deps.log(paint(`${GLYPHS.recycle} ${item.id} already installed`, 'dim'));
      result.skipped++;
      result.ok++;
      continue;
    }

    if (blockedDefaults.has(item.id)) {
      // already counted via result.conflicts++ during conflict detection
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
        { selected: [item], scope: 'global', repoRoot: null },
        {
          run: deps.run,
          onEvent: wrappedOnEvent,
          dryRun: !!deps.dryRun,
          record: deps.dryRun ? (cmd) => deps.log(paint(`  $ ${cmd}`, 'dim')) : undefined,
        },
      );
      deps.log(paint(`${GLYPHS.ok} ${item.id}${deps.dryRun ? ' (dry-run)' : ''}`, 'ok'));
      result.ok++;
    } catch (e) {
      deps.err(paint(`${GLYPHS.fail} ${item.id}: ${(e as Error).message}`, 'fail'));
      result.failed++;
    }
  }

  const summaryColor = result.failed > 0 ? 'fail' : 'ok';
  const dryNote = deps.dryRun ? ' [dry-run]' : '';
  deps.log(paint(`default${dryNote}: ${result.ok} ok, ${result.failed} failed, ${result.skipped} skipped, ${result.conflicts} conflicts`, summaryColor));
  return result;
}

export interface RunDefaultOptions {
  refreshCatalog?: boolean;
  dryRun?: boolean;
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

  process.stdout.write(printHeader(opts.dryRun ? 'default --dry-run' : 'default'));

  const repoRoot = await findRepoRoot();

  const richRun: RunDefaultInstallDeps['run'] = async (cmd) => {
    return realShellRunner(cmd);
  };

  const result = await runDefaultInstall({
    items: defaults,
    catalog,
    repoRoot,
    detect: (items) => detectStates(items, undefined, repoRoot),
    run: richRun,
    log: (m) => process.stdout.write(m + '\n'),
    err: (m) => process.stderr.write(m + '\n'),
    onEvent: () => { /* progress already logged via per-item log() calls */ },
    dryRun: !!opts.dryRun,
  });

  if (result.failed > 0) process.exitCode = 1;
}
