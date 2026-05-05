import { execa } from 'execa';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import type { CatalogItem, InstallState } from '../types.js';

export function planUpdate(items: CatalogItem[], states: InstallState[], only?: string): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items
    .filter((i) => installed.has(i.id) && i.update)
    .filter((i) => !only || i.id === only);
}

export async function runUpdate(opts: { only?: string } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const states = await detectStates(catalog.items);
  const targets = planUpdate(catalog.items, states, opts.only);
  if (targets.length === 0) { console.log('Nothing to update.'); return; }
  for (const t of targets) {
    process.stdout.write(`Updating ${t.name} ... `);
    const r = await execa(t.update!.command, { shell: true, reject: false });
    if (r.exitCode === 0) console.log('✓');
    else { console.log(`✗ (exit ${r.exitCode})`); process.exit(1); }
  }
}
