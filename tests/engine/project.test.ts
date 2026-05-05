import { describe, it, expect, vi } from 'vitest';
import { findRepoRoot } from '../../src/engine/project.js';

describe('findRepoRoot', () => {
  it('returns trimmed stdout when git rev-parse succeeds', async () => {
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '/Users/me/proj\n', stderr: '' }));
    expect(await findRepoRoot(run)).toBe('/Users/me/proj');
  });

  it('returns null when git rev-parse fails', async () => {
    const run = vi.fn(async () => ({ exitCode: 128, stdout: '', stderr: 'not a git repo' }));
    expect(await findRepoRoot(run)).toBeNull();
  });

  it('returns null when git binary is missing', async () => {
    const run = vi.fn(async () => { throw new Error('ENOENT'); });
    expect(await findRepoRoot(run)).toBeNull();
  });
});
