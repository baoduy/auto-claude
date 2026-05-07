import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const cli = join(repoRoot, 'dist', 'cli.js');

describe('e2e: auto-claude default --list', () => {
  beforeAll(async () => {
    if (!existsSync(cli)) {
      await execa('pnpm', ['build'], { cwd: repoRoot });
    }
  });

  it('prints Default tools and Default plugins sections', async () => {
    const r = await execa('node', [cli, 'default', '--list'], { reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Memory backend:/);
    expect(r.stdout).toMatch(/Core plugins & skill packs:/);
  }, 30_000);

  it('alias -l works the same way', async () => {
    const r = await execa('node', [cli, 'default', '-l'], { reject: false });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Memory backend:/);
  }, 30_000);
});
