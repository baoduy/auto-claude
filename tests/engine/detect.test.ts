import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStates } from '../../src/engine/detect.js';
import type { CatalogItem, ToolItem } from '../../src/types.js';

const item = (over: Partial<ToolItem> = {}): CatalogItem => ({
  id: 'rtk', name: 'rtk', description: '', kind: 'tool', defaultScope: 'global',
  detect: { command: 'rtk --version' },
  install: { command: 'npm i -g rtk' },
  ...over,
});

describe('detectStates', () => {
  it('marks installed when exit code is 0 and no versionMatch', async () => {
    const states = await detectStates([item()],
      async () => ({ exitCode: 0, stdout: 'rtk 1.2.3', stderr: '' }));
    expect(states[0]!).toEqual({ itemId: 'rtk', installed: true, version: 'rtk 1.2.3' });
  });

  it('marks not installed when exit code != 0', async () => {
    const states = await detectStates([item()],
      async () => ({ exitCode: 127, stdout: '', stderr: 'not found' }));
    expect(states[0]!.installed).toBe(false);
  });

  it('uses versionMatch regex against stdout', async () => {
    const it1 = item({ id: 'sp', detect: { command: 'list', versionMatch: 'superpowers' } });
    const states = await detectStates([it1],
      async () => ({ exitCode: 0, stdout: 'foo\nsuperpowers\nbar', stderr: '' }));
    expect(states[0]!.installed).toBe(true);
  });

  it('versionMatch miss => not installed even with exit 0', async () => {
    const it1 = item({ id: 'sp', detect: { command: 'list', versionMatch: 'superpowers' } });
    const states = await detectStates([it1],
      async () => ({ exitCode: 0, stdout: 'foo\nbar', stderr: '' }));
    expect(states[0]!.installed).toBe(false);
  });

  it('treats runner exception as not installed', async () => {
    const states = await detectStates([item()],
      async () => { throw new Error('ENOENT'); });
    expect(states[0]!.installed).toBe(false);
  });
});

describe('detectStates with npm-kind detect', () => {
  const npmItem = (over: Partial<ToolItem> = {}): CatalogItem => ({
    id: 'cavemem', name: 'cavemem', description: '', kind: 'tool', defaultScope: 'global',
    detect: { kind: 'npm', package: 'cavemem' },
    install: { command: 'npm install -g cavemem' },
    ...over,
  });

  it('marks installed when `npm ls -g <pkg>` returns json with the package', async () => {
    const calls: string[] = [];
    const stdout = JSON.stringify({ dependencies: { cavemem: { version: '1.2.3' } } });
    const states = await detectStates([npmItem()], async (cmd) => {
      calls.push(cmd);
      return { exitCode: 0, stdout, stderr: '' };
    });
    expect(states[0]!.installed).toBe(true);
    expect(states[0]!.version).toBe('cavemem@1.2.3');
    expect(calls[0]).toBe('npm ls -g cavemem --depth=0 --json');
  });

  it('reports not installed when npm probe fails', async () => {
    const states = await detectStates([npmItem()], async () => {
      return { exitCode: 1, stdout: '', stderr: '' };
    });
    expect(states[0]!.installed).toBe(false);
  });
});

it('detects mcp items by reading .mcp.json from repoRoot', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'mcp-detect-'));
  try {
    await fs.writeFile(
      join(repo, '.mcp.json'),
      JSON.stringify({ mcpServers: { foo: { command: 'x' } } }),
      'utf-8',
    );
    const items = [{
      id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
      mcpKey: 'foo', mcpServer: { command: 'x' },
    }, {
      id: 'bar-mcp', name: 'Bar', description: '', kind: 'mcp' as const,
      mcpKey: 'bar', mcpServer: { command: 'y' },
    }];
    const states = await detectStates(items, async () => ({ exitCode: 0, stdout: '', stderr: '' }), repo);
    expect(states.find(s => s.itemId === 'foo-mcp')?.installed).toBe(true);
    expect(states.find(s => s.itemId === 'bar-mcp')?.installed).toBe(false);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

it('mcp items report installed:false when no repoRoot is provided', async () => {
  const items = [{
    id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
    mcpKey: 'foo', mcpServer: { command: 'x' },
  }];
  const states = await detectStates(items);
  expect(states[0]).toEqual({ itemId: 'foo-mcp', installed: false });
});
