import { execa } from 'execa';

export interface RunResult { exitCode: number; stdout: string; stderr: string }
export type Runner = (cmd: string, args: string[]) => Promise<RunResult>;

export const realRunner: Runner = async (cmd, args) => {
  const r = await execa(cmd, args, { reject: false });
  return { exitCode: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr };
};

export async function findRepoRoot(run: Runner = realRunner): Promise<string | null> {
  try {
    const r = await run('git', ['rev-parse', '--show-toplevel']);
    if (r.exitCode === 0) return r.stdout.trim() || null;
    return null;
  } catch {
    return null;
  }
}
