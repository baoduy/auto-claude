import { describe, it, expect } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };
import type { Catalog, InstallPlan } from '../../src/types.js';

describe('e2e: install dry-run for all 4 items, project scope', () => {
  it('records expected command sequence', async () => {
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

    // Order: repo-aware tools → plugins, post-install interleaved.
    expect(recorded).toEqual([
      'brew install rtk',                                          // rtk (repo-aware tool)
      'rtk init -g',                                               // rtk post-install
      'claude plugin install claude-mem@thedotmack',               // claude-mem plugin
      'claude plugin install superpowers@claude-plugins-official',
      'claude plugin install claude-code-setup@claude-plugins-official',
      // claude-code-setup post-install is a claude-prompt (not shell) — not recorded
    ]);
  });
});
