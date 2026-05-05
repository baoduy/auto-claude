import type { CatalogItem } from '../types.js';
import { isShellItem } from '../types.js';

function isRepoAware(item: CatalogItem): boolean {
  if (!isShellItem(item)) return false;
  return (item.postInstall ?? []).some((p) => p.requiresRepo)
      || item.install.cwd === 'repo-root';
}

/** Order: global tools/mcp → repo-aware tools → plugins. Inner order preserved. */
export function orderForInstall(items: CatalogItem[]): CatalogItem[] {
  const globalTools: CatalogItem[] = [];
  const repoTools: CatalogItem[] = [];
  const plugins: CatalogItem[] = [];
  for (const it of items) {
    if (it.kind === 'plugin') plugins.push(it);
    else if (isRepoAware(it)) repoTools.push(it);
    else globalTools.push(it);
  }
  return [...globalTools, ...repoTools, ...plugins];
}

/** Reverse of install order: plugins → repo-aware tools → global tools. */
export function orderForUninstall(items: CatalogItem[]): CatalogItem[] {
  return orderForInstall(items).reverse();
}
