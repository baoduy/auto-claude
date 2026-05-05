import { execa } from 'execa';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import type { CatalogItem, InstallState } from '../types.js';
import { isShellItem } from '../types.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';
import { flattenItems } from '../catalog/groups.js';

export function planUpdate(items: CatalogItem[], states: InstallState[], only?: string): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items
    .filter((i) => installed.has(i.id) && isShellItem(i) && i.update)
    .filter((i) => !only || i.id === only);
}

export async function runUpdate(opts: { only?: string } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const states = await detectStates(flattenItems(catalog));
  const targets = planUpdate(flattenItems(catalog), states, opts.only);
  process.stdout.write(printHeader('update'));
  if (targets.length === 0) { console.log('Nothing to update.'); return; }
  for (const t of targets) {
    process.stdout.write(`Updating ${t.name} ... `);
    if (!isShellItem(t)) continue;
    const r = await execa(t.update!.command, { shell: true, reject: false });
    if (r.exitCode === 0) console.log(paint(GLYPHS.ok, 'ok'));
    else { console.log(paint(`${GLYPHS.fail} (exit ${r.exitCode})`, 'fail')); process.exit(1); }
  }
}
