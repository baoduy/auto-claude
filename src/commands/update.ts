import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import type { CatalogItem, InstallState } from '../types.js';
import { isShellItem } from '../types.js';
import { printHeader } from '../ui/Header.js';
import { flattenItems } from '../catalog/groups.js';
import { streamSimple, type StreamCommand } from '../engine/stream-runner.js';

export function planUpdate(items: CatalogItem[], states: InstallState[], only?: string): CatalogItem[] {
  const installed = new Set(states.filter((s) => s.installed).map((s) => s.itemId));
  return items
    .filter((i) => installed.has(i.id) && isShellItem(i) && i.update)
    .filter((i) => !only || i.id === only);
}

export async function runUpdate(opts: { only?: string; dryRun?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps());
  const repoRoot = await findRepoRoot();
  const states = await detectStates(flattenItems(catalog), undefined, repoRoot);
  const targets = planUpdate(flattenItems(catalog), states, opts.only);
  process.stdout.write(printHeader('update'));
  if (targets.length === 0) { console.log('Nothing to update.'); return; }
  if (opts.dryRun) {
    console.log('--- dry run: would run ---');
    for (const t of targets) {
      if (!isShellItem(t)) continue;
      console.log(`  ${t.update!.command}`);
    }
    console.log('--- no changes were applied ---');
    return;
  }
  const cmds: StreamCommand[] = targets
    .filter(isShellItem)
    .map((t) => ({ itemId: t.id, itemName: t.name, label: `Update ${t.name}`, command: t.update!.command }));
  const result = await streamSimple(cmds);
  if (result.failed.length > 0) process.exitCode = 1;
}
