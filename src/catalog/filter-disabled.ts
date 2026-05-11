import type { Catalog } from '../types.js';

/** Returns a new catalog with `disabled: true` items and groups removed.
 *  Groups left empty by item filtering are also dropped. */
export function filterDisabled(catalog: Catalog): Catalog {
  const groups = catalog.groups
    .filter((g) => g.disabled !== true)
    .map((g) => ({ ...g, items: g.items.filter((i) => i.disabled !== true) }))
    .filter((g) => g.items.length > 0);
  return { ...catalog, groups };
}
