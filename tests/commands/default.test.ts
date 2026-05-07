import { describe, it, expect } from 'vitest';
import { renderDefaultList, runDefaultInstall } from '../../src/commands/default.js';
import type { CatalogItem, InstallState, Catalog } from '../../src/types.js';
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

function mkSibling(id: string, withUninstall = true): CatalogItem {
  return {
    id, name: id, description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: `${id} -v` }, install: { command: `install-${id}` },
    ...(withUninstall ? { uninstall: { command: `uninstall-${id}` } } : {}),
  };
}

function mkCatalog(groups: import('../../src/types.js').CatalogGroup[]): Catalog {
  return { version: 2, updatedAt: '2026-05-07', groups };
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
      id: 'cs', name: 'cs', description: '', kind: 'plugin', defaultScope: 'global',
      detect: { command: 'cs -v' }, install: { command: 'install-cs' }, default: true,
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

  it('uninstalls a drifted pick-one sibling before installing the default', async () => {
    const a = mkItem('a'); // default: true
    const b = mkSibling('b', true); // drifted, has uninstall
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(calls).toEqual(['uninstall-b', 'install-a']);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.conflicts).toBe(0);
  });

  it('initializes the conflicts counter at zero on a clean run', async () => {
    const result = await runDefaultInstall({
      items: [mkItem('rtk')],
      detect: async () => [{ itemId: 'rtk', installed: false }],
      run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    expect(result.conflicts).toBe(0);
  });

  it('blocks the default install when swap-uninstall fails', async () => {
    const a = mkItem('a'); // default: true
    const b = mkSibling('b', true); // drifted, has uninstall
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => {
        calls.push(cmd);
        // simulate uninstall failure
        if (cmd === 'uninstall-b') return { exitCode: 1, stdout: '', stderr: 'boom' };
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    // 'install-a' must NOT have been called — invariant: never install default while sibling on disk
    expect(calls).toEqual(['uninstall-b']);
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(1);
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

  it('skips the default and bumps conflicts when the drifted sibling has no uninstall command', async () => {
    const a = mkItem('a'); // default: true
    const b = mkSibling('b', false); // drifted, NO uninstall
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const errs: string[] = [];
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: (m) => logs.push(m),
      err: (m) => errs.push(m),
      onEvent: () => {},
    });
    expect(calls).toEqual([]);
    expect(result.ok).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(logs.some((l) => /no uninstall command; skipping a/.test(l))).toBe(true);
  });

  it('runs all swap-uninstalls before any default install across multiple groups', async () => {
    const a = mkItem('a');
    const x = mkItem('x');
    const b = mkSibling('b', true);
    const y = mkSibling('y', true);
    const catalog: Catalog = mkCatalog([
      { id: 'g1', name: 'G1', kind: 'pick-one', items: [a, b] },
      { id: 'g2', name: 'G2', kind: 'pick-one', items: [x, y] },
    ]);
    const calls: string[] = [];
    const result = await runDefaultInstall({
      items: [a, x],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
        { itemId: 'x', installed: false },
        { itemId: 'y', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: () => {},
      err: () => {},
      onEvent: () => {},
    });
    const lastUninstall = Math.max(calls.indexOf('uninstall-b'), calls.indexOf('uninstall-y'));
    const firstInstall = Math.min(calls.indexOf('install-a'), calls.indexOf('install-x'));
    expect(lastUninstall).toBeGreaterThanOrEqual(0);
    expect(firstInstall).toBeGreaterThan(lastUninstall);
    expect(result.ok).toBe(2);
    expect(result.conflicts).toBe(0);
  });

  it('records swap-uninstall before install in dry-run, executes nothing', async () => {
    const a = mkItem('a');
    const b = mkSibling('b', true);
    const catalog: Catalog = mkCatalog([
      { id: 'mem', name: 'Memory', kind: 'pick-one', items: [a, b] },
    ]);
    const calls: string[] = [];
    const logs: string[] = [];
    const result = await runDefaultInstall({
      items: [a],
      catalog,
      detect: async () => [
        { itemId: 'a', installed: false },
        { itemId: 'b', installed: true },
      ],
      run: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: '', stderr: '' }; },
      log: (m) => logs.push(m),
      err: () => {},
      onEvent: () => {},
      dryRun: true,
    });
    expect(calls).toEqual([]);
    const uIdx = logs.findIndex((l) => l.includes('$ uninstall-b'));
    const iIdx = logs.findIndex((l) => l.includes('$ install-a'));
    expect(uIdx).toBeGreaterThanOrEqual(0);
    expect(iIdx).toBeGreaterThan(uIdx);
    expect(result.ok).toBe(1);
  });
});

describe('renderDefaultList', () => {
  it('groups by catalog group and shows install state', () => {
    const catalog: Catalog = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        {
          id: 'core',
          name: 'Core Tools',
          kind: 'pick-many',
          items: items.filter((i) => i.default === true),
        },
      ],
    };
    const out = renderDefaultList(catalog, states);
    expect(out).toMatch(/Core Tools:/);
    expect(out).toMatch(/rtk\s+\S*\s*installed/);
    expect(out).toMatch(/cm\s+\S*\s*not installed/);
    expect(out).not.toContain('nope');
  });

  it('omits groups with no default items', () => {
    const rtk: CatalogItem = items[0]!;
    const nope: CatalogItem = items[2]!;
    const catalog: Catalog = {
      version: 2,
      updatedAt: '2026-05-05',
      groups: [
        {
          id: 'memory',
          name: 'Memory',
          kind: 'pick-one',
          items: [rtk],
        },
        {
          id: 'other',
          name: 'Other',
          kind: 'pick-many',
          items: [nope],
        },
      ],
    };
    const out = renderDefaultList(catalog, [{ itemId: 'rtk', installed: true }]);
    expect(out).toContain('Memory:');
    expect(out).not.toContain('Other:');
  });
});
