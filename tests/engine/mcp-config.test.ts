import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readMcpConfig,
  hasMcpServer,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  writeMcpConfig,
} from '../../src/engine/mcp-config.js';

function mkRepo(): string {
  return mkdtempSync(join(tmpdir(), 'mcp-test-'));
}

describe('mcp-config', () => {
  it('readMcpConfig returns empty mcpServers when file is missing', async () => {
    const repo = mkRepo();
    try {
      expect(await readMcpConfig(join(repo, '.mcp.json'))).toEqual({ mcpServers: {} });
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('addMcpServer is a no-op when key already exists', () => {
    const cfg = { mcpServers: { foo: { command: 'a' } } };
    const next = addMcpServer(cfg, 'foo', { command: 'b' });
    expect(next.mcpServers['foo']?.command).toBe('a');
  });

  it('addMcpServer adds new keys without touching others', () => {
    const cfg = { mcpServers: { foo: { command: 'a' } } };
    const next = addMcpServer(cfg, 'bar', { command: 'b' });
    expect(next.mcpServers['foo']?.command).toBe('a');
    expect(next.mcpServers['bar']?.command).toBe('b');
  });

  it('updateMcpServer overwrites only the named key', () => {
    const cfg = { mcpServers: { foo: { command: 'a' }, bar: { command: 'b' } } };
    const next = updateMcpServer(cfg, 'foo', { command: 'a2' });
    expect(next.mcpServers['foo']?.command).toBe('a2');
    expect(next.mcpServers['bar']?.command).toBe('b');
  });

  it('removeMcpServer deletes the key, leaves others, leaves empty object', () => {
    const cfg = { mcpServers: { foo: { command: 'a' } } };
    const next = removeMcpServer(cfg, 'foo');
    expect(next.mcpServers).toEqual({});
  });

  it('hasMcpServer returns true only when the key is present', () => {
    expect(hasMcpServer({ mcpServers: { foo: { command: 'x' } } }, 'foo')).toBe(true);
    expect(hasMcpServer({ mcpServers: {} }, 'foo')).toBe(false);
  });

  it('writeMcpConfig creates .mcp.json with 2-space indent and trailing newline', async () => {
    const repo = mkRepo();
    try {
      await writeMcpConfig(join(repo, '.mcp.json'), { mcpServers: { foo: { command: 'x' } } });
      const buf = await fs.readFile(join(repo, '.mcp.json'), 'utf-8');
      expect(buf).toBe('{\n  "mcpServers": {\n    "foo": {\n      "command": "x"\n    }\n  }\n}\n');
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('readMcpConfig throws a typed error on malformed JSON', async () => {
    const repo = mkRepo();
    try {
      await fs.writeFile(join(repo, '.mcp.json'), '{not json', 'utf-8');
      await expect(readMcpConfig(join(repo, '.mcp.json'))).rejects.toThrow(/\.mcp\.json/);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
});
