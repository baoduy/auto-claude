import { describe, it, expect } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import { flattenItems } from '../../src/catalog/groups.js';
import bundled from '../../catalog.json' with { type: 'json' };
import type { Catalog, InstallPlan } from '../../src/types.js';
import { isShellItem } from '../../src/types.js';

describe('e2e: install dry-run for all catalog items, project scope', () => {
  it('records install commands for every shell item and orders tools before plugins', async () => {
    const cat = bundled as Catalog;
    const items = flattenItems(cat);
    const plan: InstallPlan = {
      selected: items,
      pluginScope: 'project',
      repoRoot: '/repo',
    };
    const recorded: string[] = [];
    await executeInstall(plan, {
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      onEvent: () => {},
      dryRun: true,
      record: (c) => recorded.push(c),
    });

    // Every shell item's install command must appear in the recorded list.
    const shellItems = items.filter(isShellItem);
    for (const item of shellItems) {
      expect(
        recorded,
        `expected recorded commands to include install for ${item.id}`
      ).toContain(item.install.command);
    }

    // Ordering invariant: every tool's install command precedes every plugin's.
    const tools = shellItems.filter((i) => i.kind === 'tool');
    const plugins = shellItems.filter((i) => i.kind === 'plugin');
    const lastToolIdx = Math.max(
      ...tools.map((t) => recorded.indexOf(t.install.command))
    );
    const firstPluginIdx = Math.min(
      ...plugins.map((p) => recorded.indexOf(p.install.command))
    );
    expect(lastToolIdx).toBeLessThan(firstPluginIdx);
  });
});
