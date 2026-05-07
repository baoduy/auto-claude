import { describe, it, expect } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import { flattenItems } from '../../src/catalog/groups.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };
import type { Catalog, InstallPlan } from '../../src/types.js';
import { isShellItem } from '../../src/types.js';

describe('e2e: install dry-run for all bundled items, project scope', () => {
  it('records every install command and orders tools before plugins', async () => {
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

    // Order: repo-aware tools (gitnexus, graphify, rtk) → plugins, post-install interleaved.
    expect(recorded).toEqual([
      // gitnexus (repo-aware tool — has analyze post)
      'npm install -g gitnexus',
      'claude mcp add gitnexus -- npx -y gitnexus@latest mcp',
      'npx gitnexus analyze',
      // graphify (repo-aware tool — has hook install post)
      'pip install graphifyy && graphify install',
      'graphify hook install',
      // rtk (repo-aware tool)
      'brew install rtk',
      'rtk init -g',
      // plugins, in catalog order
      'claude plugin install claude-mem@thedotmack',
      'claude plugin install context7@claude-plugins-official',
      'claude plugin install microsoft-docs@claude-plugins-official',
      'claude plugin install superpowers@claude-plugins-official',
      'claude plugin install claude-code-setup@claude-plugins-official',
      // claude-code-setup post-install is a claude-prompt (not shell) — not recorded
      'claude plugin install plugin-dev@claude-plugins-official',
      'claude plugin marketplace add microsoft/skills && claude plugin install deep-wiki@skills',
      'claude plugin marketplace add microsoft/azure-skills && claude plugin install azure@azure-skills',
      'claude plugin marketplace add baoduy/drunk.charts && claude plugin install drunk-app@drunk-charts',
      'claude plugin marketplace add baoduy/DKNet.Templates && claude plugin install dknet-minimal@dknet-marketplace',
    ]);
  });
});
