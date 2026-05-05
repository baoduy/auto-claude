import { execa } from 'execa';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import type { CatalogItem, InstallState } from '../types.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';
import { flattenItems } from '../catalog/groups.js';

export function planUninstall(items: CatalogItem[], states: InstallState[]): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items.filter((i) => installed.has(i.id) && i.uninstall);
}

export async function runRemove(opts: { yes?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const states = await detectStates(flattenItems(catalog));
  const targets = planUninstall(flattenItems(catalog), states);
  process.stdout.write(printHeader('remove'));
  if (targets.length === 0) {
    console.log('Nothing to uninstall.');
    return;
  }
  console.log(paint('The following items will be uninstalled:', 'brand'));
  for (const t of targets) {
    const kindGlyph = t.kind === 'tool'
      ? paint(GLYPHS.tool, 'tool')
      : paint(GLYPHS.plugin, 'plugin');
    console.log(`  ${paint(GLYPHS.remove, 'warn')} ${kindGlyph} ${t.name}`);
  }
  if (!opts.yes) {
    console.log('\nRe-run with --yes to confirm.');
    return;
  }
  for (const t of targets) {
    process.stdout.write(`Uninstalling ${t.name} ... `);
    const r = await execa(t.uninstall!.command, { shell: true, reject: false });
    if (r.exitCode === 0) console.log(paint(GLYPHS.ok, 'ok'));
    else { console.log(paint(`${GLYPHS.fail} (exit ${r.exitCode})`, 'fail')); process.exit(1); }
  }
}
