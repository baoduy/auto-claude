import type { CatalogItem, InstallState } from '../types.js';
import { execa } from 'execa';
import { readMcpConfig, hasMcpServer } from './mcp-config.js';

export interface ShellRunner {
  (cmdline: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export const realShellRunner: ShellRunner = async (cmdline) => {
  const r = await execa(cmdline, { shell: true, reject: false });
  return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
};

export async function detectStates(
  items: CatalogItem[],
  run: ShellRunner = realShellRunner,
  repoRoot: string | null = null,
): Promise<InstallState[]> {
  // For mcp items, read the file once.
  let mcpConfig: { mcpServers: Record<string, unknown> } | null = null;
  if (repoRoot) {
    try { mcpConfig = await readMcpConfig(repoRoot); } catch { mcpConfig = { mcpServers: {} }; }
  }

  return Promise.all(items.map(async (item) => {
    if (item.kind === 'mcp') {
      if (!mcpConfig) return { itemId: item.id, installed: false };
      return { itemId: item.id, installed: hasMcpServer(mcpConfig as any, item.mcpKey) };
    }
    try {
      const r = await run(item.detect.command);
      if (r.exitCode !== 0) return { itemId: item.id, installed: false };
      if (item.detect.versionMatch) {
        const re = new RegExp(item.detect.versionMatch);
        const match = re.test(r.stdout);
        return { itemId: item.id, installed: match, version: match ? extractFirstLine(r.stdout) : undefined };
      }
      return { itemId: item.id, installed: true, version: extractFirstLine(r.stdout) };
    } catch {
      return { itemId: item.id, installed: false };
    }
  }));
}

function extractFirstLine(s: string): string | undefined {
  const line = s.split('\n')[0]?.trim();
  return line || undefined;
}
