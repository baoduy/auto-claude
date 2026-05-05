import { describe, it, expect } from 'vitest';
import { detectStates } from '../../src/engine/detect.js';
import type { CatalogItem } from '../../src/types.js';

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
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
