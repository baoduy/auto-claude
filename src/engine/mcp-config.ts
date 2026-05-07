import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { McpServerConfig, Scope } from '../types.js';

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
  /** Other top-level keys preserved across read/write so user-level
   *  ~/.claude.json (which contains many unrelated fields) round-trips
   *  cleanly. */
  [extra: string]: unknown;
}

/** Resolve the on-disk MCP config file for a given scope.
 *  - `project` → `<repoRoot>/.mcp.json`
 *  - `global`  → `~/.claude.json`  (Claude Code's user-level config)
 */
export function mcpConfigPath(scope: Scope, repoRoot: string | null): string {
  if (scope === 'global') return join(homedir(), '.claude.json');
  if (!repoRoot) {
    throw new Error('project-scope mcp install requires repoRoot');
  }
  return join(repoRoot, '.mcp.json');
}

export async function readMcpConfig(path: string): Promise<McpConfig> {
  let text: string;
  try {
    text = await fs.readFile(path, 'utf-8');
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return { mcpServers: {} };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Failed to parse ${path}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object') return { mcpServers: {} };
  const obj = parsed as Partial<McpConfig> & Record<string, unknown>;
  return { ...obj, mcpServers: (obj.mcpServers as Record<string, McpServerConfig>) ?? {} };
}

export function hasMcpServer(cfg: McpConfig, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(cfg.mcpServers, key);
}

export function addMcpServer(cfg: McpConfig, key: string, server: McpServerConfig): McpConfig {
  if (hasMcpServer(cfg, key)) return cfg;
  return { ...cfg, mcpServers: { ...cfg.mcpServers, [key]: server } };
}

export function updateMcpServer(cfg: McpConfig, key: string, server: McpServerConfig): McpConfig {
  return { ...cfg, mcpServers: { ...cfg.mcpServers, [key]: server } };
}

export function removeMcpServer(cfg: McpConfig, key: string): McpConfig {
  if (!hasMcpServer(cfg, key)) return cfg;
  const next = { ...cfg.mcpServers };
  delete next[key];
  return { ...cfg, mcpServers: next };
}

export async function writeMcpConfig(path: string, cfg: McpConfig): Promise<void> {
  const json = JSON.stringify(cfg, null, 2) + '\n';
  await fs.writeFile(path, json, 'utf-8');
}
