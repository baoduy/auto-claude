import type { CatalogItem, DetectSpec, InstallState, NpmDetectSpec } from '../types.js';
import { execa } from 'execa';
import { readMcpConfig, hasMcpServer, mcpConfigPath } from './mcp-config.js';

export interface ShellRunner {
  (cmdline: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

/** Per-detect command timeout in ms. Kills hung probes (e.g. tools that
 *  open a daemon on `--version`). 8s is generous for legitimate CLIs. */
export const DETECT_TIMEOUT_MS = 8000;

/** Shell runner with no timeout. Used for install/uninstall commands which
 *  may legitimately take minutes (npm install, brew install, etc.). */
export const realShellRunner: ShellRunner = async (cmdline) => {
  const r = await execa(cmdline, { shell: true, reject: false });
  return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
};

/** Shell runner with a short timeout. Used only for detection probes so a
 *  misbehaving `--version` (e.g. one that opens a daemon) cannot hang the CLI. */
export const detectShellRunner: ShellRunner = async (cmdline) => {
  const r = await execa(cmdline, {
    shell: true,
    reject: false,
    timeout: DETECT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (r.timedOut) return { exitCode: 124, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
};

function isShellDetect(d: DetectSpec): d is Exclude<DetectSpec, NpmDetectSpec> {
  return d.kind !== 'npm';
}

async function detectViaNpm(
  spec: NpmDetectSpec,
  run: ShellRunner,
): Promise<{ installed: boolean; version?: string }> {
  const npmCmd = `npm ls -g ${spec.package} --depth=0 --json`;
  const r = await run(npmCmd).catch(() => null);
  if (r && r.exitCode === 0) {
    const v = parseNpmLsVersion(r.stdout, spec.package);
    return { installed: true, version: v };
  }
  return { installed: false };
}

function parseNpmLsVersion(stdout: string, pkg: string): string | undefined {
  try {
    const j = JSON.parse(stdout);
    const v = j?.dependencies?.[pkg]?.version;
    return typeof v === 'string' ? `${pkg}@${v}` : undefined;
  } catch {
    return undefined;
  }
}

export async function detectStates(
  items: CatalogItem[],
  run: ShellRunner = detectShellRunner,
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
      if (item.detect.kind === 'npm') {
        const res = await detectViaNpm(item.detect, run);
        return { itemId: item.id, installed: res.installed, version: res.version };
      }
      const shellDetect = item.detect;
      if (!isShellDetect(shellDetect)) return { itemId: item.id, installed: false };
      const r = await run(shellDetect.command);
      if (r.exitCode !== 0) return { itemId: item.id, installed: false };
      if (shellDetect.versionMatch) {
        const re = new RegExp(shellDetect.versionMatch);
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
