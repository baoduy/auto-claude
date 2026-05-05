import type { CatalogItem, InstallState } from '../types.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';

export function renderStatus(items: CatalogItem[], states: InstallState[]): string {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  lines.push('auto-claude — status');
  lines.push('');
  for (const item of items) {
    const s = byId.get(item.id);
    const badge = s?.installed ? '✓ installed' : '✗ missing  ';
    const ver = s?.version ? `  (${s.version})` : '';
    lines.push(`  ${badge}  ${item.kind.padEnd(7)}  ${item.name}${ver}`);
  }
  return lines.join('\n');
}

export async function runStatus(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const states = await detectStates(catalog.items);
  console.log(renderStatus(catalog.items, states));
}
