import type { InstallState } from '../types.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { findRepoRoot } from '../engine/project.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';
import { flattenItems } from '../catalog/groups.js';

export function renderStatus(catalog: import('../types.js').Catalog, states: InstallState[]): string {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  for (const g of catalog.groups) {
    if (lines.length > 0) lines.push('');
    const headerSuffix = g.kind === 'pick-one' ? ' (pick-one)' : '';
    lines.push(paint(`${g.name}${headerSuffix}:`, 'group'));
    for (const item of g.items) {
      const s = byId.get(item.id);
      const badge = s?.installed
        ? paint(`${GLYPHS.ok} installed`, 'ok')
        : paint(`${GLYPHS.missing} missing  `, 'dim');
      const kindGlyph = item.kind === 'tool'
        ? paint(GLYPHS.tool, 'tool')
        : paint(GLYPHS.plugin, 'plugin');
      const ver = s?.version ? paint(`  (${s.version})`, 'dim') : '';
      lines.push(`  ${badge}  ${kindGlyph} ${item.kind.padEnd(7)}  ${item.name}${ver}`);
    }
  }
  return lines.join('\n');
}

export async function runStatus(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const repoRoot = await findRepoRoot();
  const states = await detectStates(flattenItems(catalog), undefined, repoRoot);
  process.stdout.write(printHeader('status'));
  console.log(renderStatus(catalog, states));
}
