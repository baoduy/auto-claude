import type { Catalog, CatalogGroup, CatalogItem, ItemKind } from '../types.js';

export function flattenItems(catalog: Catalog): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const g of catalog.groups) {
    for (const it of g.items) out.push(it);
  }
  return out;
}

export function groupByItemId(catalog: Catalog): Map<string, CatalogGroup> {
  const m = new Map<string, CatalogGroup>();
  for (const g of catalog.groups) {
    for (const it of g.items) m.set(it.id, g);
  }
  return m;
}

const KIND_ORDER: readonly ItemKind[] = ['tool', 'plugin', 'mcp'] as const;

export function dominantKind(group: CatalogGroup): ItemKind {
  const counts: Record<ItemKind, number> = { tool: 0, plugin: 0, mcp: 0 };
  for (const it of group.items) counts[it.kind]++;
  let best: ItemKind = KIND_ORDER[0]!;
  let bestCount = -1;
  for (const k of KIND_ORDER) {
    if (counts[k] > bestCount) {
      best = k;
      bestCount = counts[k];
    }
  }
  return best;
}

export function pageOf(group: CatalogGroup): ItemKind {
  return group.page ?? dominantKind(group);
}

/** Kinds that have at least one assigned group, in canonical order.
 *  Excludes 'mcp' when no repo is detected (matches displayCatalog filtering). */
export function activeKinds(catalog: Catalog, repoRoot: string | null): ItemKind[] {
  const out: ItemKind[] = [];
  for (const k of KIND_ORDER) {
    if (k === 'mcp' && !repoRoot) continue;
    if (catalog.groups.some((g) => pageOf(g) === k)) out.push(k);
  }
  return out;
}

export function groupsForKind(catalog: Catalog, kind: ItemKind): CatalogGroup[] {
  return catalog.groups.filter((g) => pageOf(g) === kind);
}
