import { execa } from 'execa';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import type { CatalogItem, InstallState } from '../types.js';

export function planUninstall(items: CatalogItem[], states: InstallState[]): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items.filter((i) => installed.has(i.id) && i.uninstall);
}

export async function runRemove(opts: { yes?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const states = await detectStates(catalog.items);
  const targets = planUninstall(catalog.items, states);
  if (targets.length === 0) {
    console.log('Nothing to uninstall.');
    return;
  }
  console.log('The following items will be uninstalled:');
  for (const t of targets) console.log(`  - ${t.name}`);
  if (!opts.yes) {
    console.log('\nRe-run with --yes to confirm.');
    return;
  }
  for (const t of targets) {
    process.stdout.write(`Uninstalling ${t.name} ... `);
    const r = await execa(t.uninstall!.command, { shell: true, reject: false });
    if (r.exitCode === 0) console.log('✓');
    else { console.log(`✗ (exit ${r.exitCode})`); process.exit(1); }
  }
}
