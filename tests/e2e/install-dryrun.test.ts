import { describe, it, expect } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import bundled from '../../catalog.json' with { type: 'json' };
import type { Catalog, InstallPlan } from '../../src/types.js';

describe('e2e: install dry-run for all bundled items, project scope', () => {
  it('records every install command and orders tools before plugins', async () => {
    const cat = bundled as Catalog;
    const plan: InstallPlan = {
      selected: cat.items,
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

    // Every item's install command must appear in the recorded sequence.
    for (const item of cat.items) {
      expect(recorded, `missing install for ${item.id}`).toContain(item.install.command);
    }

    // claude-prompt post-installs are NOT shell commands and must not be recorded.
    const promptValues = cat.items
      .flatMap((i) => i.postInstall ?? [])
      .filter((p) => p.type === 'claude-prompt')
      .map((p) => p.value);
    for (const v of promptValues) {
      expect(recorded).not.toContain(v);
    }

    // Order invariant: every tool's install index < every plugin's install index.
    const toolIdx = cat.items
      .filter((i) => i.kind === 'tool')
      .map((i) => recorded.indexOf(i.install.command));
    const pluginIdx = cat.items
      .filter((i) => i.kind === 'plugin')
      .map((i) => recorded.indexOf(i.install.command));
    const lastTool = Math.max(...toolIdx);
    const firstPlugin = Math.min(...pluginIdx);
    expect(lastTool).toBeLessThan(firstPlugin);
  });
});
