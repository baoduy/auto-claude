import { describe, it, expect, vi } from 'vitest';
import { streamInstall } from '../../src/engine/stream-runner.js';
import type { InstallPlan, CatalogItem } from '../../src/types.js';

function tool(id: string, postPrompt?: { label: string; value: string }): CatalogItem {
  return {
    id, name: id, description: '', kind: 'tool',
    defaultScope: 'global',
    detect: { command: 'true' },
    install: { command: `install ${id}` },
    uninstall: { command: `uninstall ${id}` },
    postInstall: postPrompt
      ? [{ type: 'claude-prompt', value: postPrompt.value, label: postPrompt.label }]
      : undefined,
  };
}

describe('streamInstall', () => {
  it('runs uninstalls then installs in order', async () => {
    const calls: string[] = [];
    const runShell = vi.fn(async (cmd: string) => { calls.push(cmd); return { exitCode: 0 }; });
    const plan: InstallPlan = {
      uninstall: [tool('a')],
      selected: [tool('b'), tool('c')],
      scope: 'global',
      repoRoot: null,
    };
    const result = await streamInstall(plan, { runShell, write: () => {} });
    expect(calls).toEqual(['uninstall a', 'install b', 'install c']);
    expect(result.succeeded).toEqual(['a', 'b', 'c']);
    expect(result.failed).toEqual([]);
  });

  it('buffers claude-prompt post-install actions', async () => {
    const plan: InstallPlan = {
      selected: [tool('b', { label: 'API key', value: 'set FOO=bar' })],
      scope: 'global', repoRoot: null,
    };
    const result = await streamInstall(plan, {
      runShell: async () => ({ exitCode: 0 }),
      write: () => {},
    });
    expect(result.claudePrompts).toEqual([{ label: 'API key', value: 'set FOO=bar' }]);
  });

  it('aborts on failure when onFailure returns abort', async () => {
    const runShell = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1 })
      .mockResolvedValueOnce({ exitCode: 0 });
    const plan: InstallPlan = {
      selected: [tool('b'), tool('c')],
      scope: 'global', repoRoot: null,
    };
    const onFailure = vi.fn(async () => 'abort' as const);
    const result = await streamInstall(plan, { runShell, onFailure, write: () => {} });
    expect(runShell).toHaveBeenCalledTimes(1);
    expect(result.failed).toEqual(['b']);
    expect(result.succeeded).toEqual([]);
  });

  it('continues past failure when onFailure returns continue', async () => {
    const runShell = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1 })
      .mockResolvedValueOnce({ exitCode: 0 });
    const plan: InstallPlan = {
      selected: [tool('b'), tool('c')],
      scope: 'global', repoRoot: null,
    };
    const onFailure = vi.fn(async () => 'continue' as const);
    const result = await streamInstall(plan, { runShell, onFailure, write: () => {} });
    expect(runShell).toHaveBeenCalledTimes(2);
    expect(result.failed).toEqual(['b']);
    expect(result.succeeded).toEqual(['c']);
  });
});
