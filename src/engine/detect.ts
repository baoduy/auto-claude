import type { CatalogItem, InstallState } from '../types.js';
import { execa } from 'execa';
import { readMcpConfig, hasMcpServer, mcpConfigPath } from './mcp-config.js';

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
  // For mcp items we look in both possible config files (project .mcp.json
  // and the user-level ~/.claude.json). An item is "installed" if its
  // mcpKey appears in either — that way the wizard reports correct state
  // regardless of whether the user previously installed at project or
  // global scope.
  const mcpKeys = new Set<string>();
  const collect = async (path: string) => {
    try {
      const cfg = await readMcpConfig(path);
      for (const k of Object.keys(cfg.mcpServers ?? {})) mcpKeys.add(k);
    } catch {
      // ignore — file missing or unreadable means "no entries"
    }
  };
  await collect(mcpConfigPath('global', null));
  if (repoRoot) await collect(mcpConfigPath('project', repoRoot));

  return Promise.all(items.map(async (item) => {
    if (item.kind === 'mcp') {
      return { itemId: item.id, installed: mcpKeys.has(item.mcpKey) };
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

/** Re-export for callers that still want a single-key check (e.g. status). */
export { hasMcpServer };
