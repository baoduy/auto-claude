import { describe, it, expect } from 'vitest';
import { renderDefaultList, runDefaultInstall } from '../../src/commands/default.js';
import type { CatalogItem, InstallState } from '../../src/types.js';
import type { EngineEvent } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, default: true },
  { id: 'cm',  name: 'cm',  description: '', kind: 'plugin', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' }, default: true },
  { id: 'nope', name: 'nope', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: '' }, install: { command: '' } }, // no default flag
];
const states: InstallState[] = [
  { itemId: 'rtk', installed: true, version: 'rtk 1.0' },
  { itemId: 'cm',  installed: false },
];

function mkItem(id: string, kind: 'tool' | 'plugin' = 'tool'): CatalogItem {
  return {
    id, name: id, description: '', kind, defaultScope: 'global',
    detect: { command: `${id} -v` }, install: { command: `install-${id}` },
    default: true,
  };
}

describe('runDefaultInstall', () => {
  it('skips already-installed items and reports success', async () => {
    const events: EngineEvent[] = [];
    const result = await runDefaultInstall({
      items: [mkItem('rtk')],
      detect: async () => [{ itemId: 'rtk', installed: true }],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: () => {},
      err: () => {},
      onEvent: (e) => events.push(e),
    });
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('runs install for missing items and reports ok', async () => {
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [mkItem('rtk')],
      detect: async () => [{ itemId: 'rtk', installed: false }],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(calls).toEqual(['install-rtk']);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('continues after one item fails and exits non-zero', async () => {
    const result = await runDefaultInstall({
      items: [mkItem('a'), mkItem('b'), mkItem('c')],
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: false },
        { itemId: 'c', installed: false },
      ],
      run: async (cmd) =>
        cmd === 'install-b'
          ? { exitCode: 1, stdout: '', stderr: 'boom' }
          : { exitCode: 0, stdout: '', stderr: '' },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(result.ok).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('suppresses post-prompt events but logs a notice', async () => {
    const item: CatalogItem = {
      ...mkItem('cs', 'plugin'),
      postInstall: [{ type: 'claude-prompt', value: 'hello', label: 'greet' }],
    };
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [item],
      detect: async () => [{ itemId: 'cs', installed: false }],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: (m) => logs.push(m),
      err: () => {},
      onEvent: () => {},
    });
    expect(result.ok).toBe(1);
    expect(logs.some((l) => /post-install Claude prompt skipped/.test(l))).toBe(true);
  });

  it('reports nothing-to-do for an empty default set', async () => {
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [],
      detect: async () => [],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: (m) => logs.push(m),
      err: () => {},
      onEvent: () => {},
    });
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(logs.some((l) => /nothing to do/.test(l))).toBe(true);
  });
});

describe('renderDefaultList', () => {
  it('groups by kind and shows install state', () => {
    const out = renderDefaultList(items.filter((i) => i.default === true), states);
    expect(out).toMatch(/Default tools:/);
    expect(out).toMatch(/Default plugins:/);
    expect(out).toMatch(/rtk\s+installed/);
    expect(out).toMatch(/cm\s+not installed/);
    expect(out).not.toContain('nope');
  });

  it('omits a section when its kind has no defaults', () => {
    const onlyTools = items.filter((i) => i.default === true && i.kind === 'tool');
    const out = renderDefaultList(onlyTools, [{ itemId: 'rtk', installed: true }]);
    expect(out).toContain('Default tools:');
    expect(out).not.toContain('Default plugins:');
  });
});
