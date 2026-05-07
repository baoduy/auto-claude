import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeInstall } from '../../src/engine/executor.js';
import type { CatalogItem, InstallPlan } from '../../src/types.js';

const c7: CatalogItem = {
  id: 'context7-mcp', name: 'context7', description: '', kind: 'mcp',
  mcpKey: 'context7', mcpServer: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
};
const ms: CatalogItem = {
  id: 'microsoft-learn-mcp', name: 'ms-learn', description: '', kind: 'mcp',
  mcpKey: 'microsoft-learn', mcpServer: { command: 'npx', args: ['-y', '@microsoft/mcp-server-learn'] },
};

describe('e2e: install + re-run + uninstall mcp items', () => {
  it('installs both, second run is a no-op, uncheck removes only the unchecked key', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-e2e-'));
    try {
      const plan: InstallPlan = { selected: [c7, ms], scope: 'project', repoRoot: repo };

      // First install
      await executeInstall(plan, { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), onEvent: () => {}, dryRun: false });
      let cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(Object.keys(cfg.mcpServers).sort()).toEqual(['context7', 'microsoft-learn']);

      // Re-run with same selection — file unchanged
      const before = await fs.readFile(join(repo, '.mcp.json'), 'utf-8');
      await executeInstall(plan, { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), onEvent: () => {}, dryRun: false });
      const after = await fs.readFile(join(repo, '.mcp.json'), 'utf-8');
      expect(after).toBe(before);

      // Uncheck context7 — should remove only that one
      const removePlan: InstallPlan = { selected: [ms], uninstall: [c7], scope: 'project', repoRoot: repo };
      await executeInstall(removePlan, { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), onEvent: () => {}, dryRun: false });
      cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.context7).toBeUndefined();
      expect(cfg.mcpServers['microsoft-learn']).toBeDefined();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
