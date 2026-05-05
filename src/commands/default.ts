import type { CatalogItem, InstallState } from '../types.js';
import { detectStates } from '../engine/detect.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';

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
