import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { McpServerConfig } from '../types.js';

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export async function readMcpConfig(repoRoot: string): Promise<McpConfig> {
  const path = join(repoRoot, '.mcp.json');
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
  const obj = parsed as Partial<McpConfig>;
  return { mcpServers: obj.mcpServers ?? {} };
}

export function hasMcpServer(cfg: McpConfig, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(cfg.mcpServers, key);
}

export function addMcpServer(cfg: McpConfig, key: string, server: McpServerConfig): McpConfig {
  if (hasMcpServer(cfg, key)) return cfg;
  return { mcpServers: { ...cfg.mcpServers, [key]: server } };
}

export function updateMcpServer(cfg: McpConfig, key: string, server: McpServerConfig): McpConfig {
  return { mcpServers: { ...cfg.mcpServers, [key]: server } };
}

export function removeMcpServer(cfg: McpConfig, key: string): McpConfig {
  if (!hasMcpServer(cfg, key)) return cfg;
  const next = { ...cfg.mcpServers };
  delete next[key];
  return { mcpServers: next };
}

export async function writeMcpConfig(repoRoot: string, cfg: McpConfig): Promise<void> {
  const path = join(repoRoot, '.mcp.json');
  const json = JSON.stringify(cfg, null, 2) + '\n';
  await fs.writeFile(path, json, 'utf-8');
}
