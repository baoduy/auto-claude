import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeInstall } from '../../src/engine/executor.js';
import type { CatalogItem, EngineEvent, InstallPlan } from '../../src/types.js';

function fixture(repo: string, selected: CatalogItem[], uninstall: CatalogItem[] = []): InstallPlan {
  return { selected, uninstall, scope: 'project', repoRoot: repo };
}

const fooMcp: CatalogItem = {
  id: 'foo-mcp', name: 'Foo MCP', description: '', kind: 'mcp',
  mcpKey: 'foo', mcpServer: { command: 'foo-cmd', args: ['--x'] },
};
const barMcp: CatalogItem = {
  id: 'bar-mcp', name: 'Bar MCP', description: '', kind: 'mcp',
  mcpKey: 'bar', mcpServer: { command: 'bar-cmd' },
};

describe('executeInstall (mcp)', () => {
  it('writes selected mcp items into .mcp.json', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-exec-'));
    try {
      const events: EngineEvent[] = [];
      await executeInstall(fixture(repo, [fooMcp, barMcp]), {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        onEvent: (e) => events.push(e),
        dryRun: false,
      });
      const cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.foo).toEqual({ command: 'foo-cmd', args: ['--x'] });
      expect(cfg.mcpServers.bar).toEqual({ command: 'bar-cmd' });
      expect(events.filter(e => e.type === 'item-success').length).toBe(2);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('skips mcp install when key already present (idempotent)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-idemp-'));
    try {
      await fs.writeFile(
        join(repo, '.mcp.json'),
        JSON.stringify({ mcpServers: { foo: { command: 'preexisting' } } }),
        'utf-8',
      );
      const events: EngineEvent[] = [];
      await executeInstall(fixture(repo, [fooMcp]), {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        onEvent: (e) => events.push(e),
        dryRun: false,
      });
      const cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.foo.command).toBe('preexisting');
      expect(events.find(e => e.type === 'item-success' && e.itemId === 'foo-mcp')).toBeDefined();
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('removes mcp keys on uninstall', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mcp-rm-'));
    try {
      await fs.writeFile(
        join(repo, '.mcp.json'),
        JSON.stringify({ mcpServers: { foo: { command: 'x' }, bar: { command: 'y' } } }),
        'utf-8',
      );
      await executeInstall(fixture(repo, [], [fooMcp]), {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        onEvent: () => {},
        dryRun: false,
      });
      const cfg = JSON.parse(await fs.readFile(join(repo, '.mcp.json'), 'utf-8'));
      expect(cfg.mcpServers.foo).toBeUndefined();
      expect(cfg.mcpServers.bar.command).toBe('y');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
