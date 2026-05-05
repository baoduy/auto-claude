import type { CatalogItem, InstallState } from '../types.js';
import { loadCatalog, defaultDeps } from '../catalog/loader.js';
import { detectStates } from '../engine/detect.js';
import { printHeader } from '../ui/Header.js';
import { GLYPHS, paint } from '../ui/theme.js';

export function renderStatus(items: CatalogItem[], states: InstallState[]): string {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  const lines: string[] = [];
  for (const item of items) {
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
  return lines.join('\n');
}

export async function runStatus(opts: { refreshCatalog?: boolean } = {}): Promise<void> {
  const catalog = await loadCatalog(defaultDeps({ refresh: opts.refreshCatalog }));
  const states = await detectStates(catalog.items);
  process.stdout.write(printHeader('status'));
  console.log(renderStatus(catalog.items, states));
}
