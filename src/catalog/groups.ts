import type { Catalog, CatalogGroup, CatalogItem } from '../types.js';

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
