import { describe, it, expect, vi } from 'vitest';
import { executeInstall } from '../../src/engine/executor.js';
import type { CatalogItem, EngineEvent, InstallPlan } from '../../src/types.js';

const tool: CatalogItem = {
  id: 'claude-mem', name: 'claude-mem', description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'cm --version' },
  install: { command: 'npm i -g cm' },
};
const rtk: CatalogItem = {
  id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'rtk --version' },
  install: { command: 'npm i -g rtk' },
  postInstall: [{ type: 'shell', value: 'rtk init -g', requiresRepo: true, label: 'init rtk' }],
};
const plug: CatalogItem = {
  id: 'sp', name: 'superpowers', description: '', kind: 'plugin', defaultScope: 'global',
  detect: { command: 'claude plugin list', versionMatch: 'superpowers' },
  install: { command: 'claude plugin install superpowers@x' },
  postInstall: [{ type: 'claude-prompt', value: 'ask claude X', label: 'lbl' }],
};

const plan = (overrides: Partial<InstallPlan> = {}): InstallPlan => ({
  selected: [tool, rtk, plug],
  scope: 'global',
  repoRoot: '/repo',
  ...overrides,
});

describe('executeInstall', () => {
  it('runs install + post-install in order, emits events, halts on failure', async () => {
    const events: EngineEvent[] = [];
    const calls: string[] = [];
    const run = vi.fn(async (cmd: string) => {
      calls.push(cmd);
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    await executeInstall(plan(), { run, onEvent: (e) => events.push(e), dryRun: false });

    expect(calls).toEqual([
      'npm i -g cm',
      'npm i -g rtk',
      'rtk init -g',
      'claude plugin install superpowers@x',
    ]);
    expect(events.find((e) => e.type === 'done')).toBeTruthy();
    expect(events.filter((e) => e.type === 'item-success').map((e: any) => e.itemId))
      .toEqual(['claude-mem', 'rtk', 'sp']);
    expect(events.filter((e) => e.type === 'post-prompt').length).toBe(1);
  });

  it('halts on first failure and emits item-failure', async () => {
    const events: EngineEvent[] = [];
    let n = 0;
    const run = async () => {
      n++;
      return n === 2
        ? { exitCode: 1, stdout: '', stderr: 'boom' }
        : { exitCode: 0, stdout: '', stderr: '' };
    };
    await expect(executeInstall(plan(), { run, onEvent: (e) => events.push(e), dryRun: false }))
      .rejects.toThrow();
    const failure = events.find((e) => e.type === 'item-failure') as any;
    expect(failure.itemId).toBe('rtk');
  });

  it('dryRun records commands without invoking runner', async () => {
    const run = vi.fn();
    const recorded: string[] = [];
    await executeInstall(plan(), {
      run: run as never,
      onEvent: () => {},
      dryRun: true,
      record: (c) => recorded.push(c),
    });
    expect(run).not.toHaveBeenCalled();
    expect(recorded).toEqual([
      'npm i -g cm',
      'npm i -g rtk',
      '(cd /repo && rtk init -g)',
      'claude plugin install superpowers@x',
    ]);
  });

  it('skips repo-aware post-install when repoRoot is null', async () => {
    const calls: string[] = [];
    const run = async (cmd: string) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; };
    await executeInstall(
      plan({ selected: [rtk], repoRoot: null }),
      { run, onEvent: () => {}, dryRun: false },
    );
    expect(calls).toEqual(['npm i -g rtk']); // rtk init -g skipped
  });

  it('plugin install runs in repoRoot cwd when scope=project', async () => {
    const cwds: (string | undefined)[] = [];
    const run = async (cmd: string, opts?: { cwd?: string }) => {
      cwds.push(opts?.cwd);
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    await executeInstall(
      plan({ selected: [plug], scope: 'project', repoRoot: '/repo' }),
      { run: run as never, onEvent: () => {}, dryRun: false },
    );
    expect(cwds[0]).toBe('/repo');
  });
});
