import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ConflictPrompt } from '../../src/ui/ConflictPrompt.js';
import type { CatalogGroup } from '../../src/types.js';

const group: CatalogGroup = {
  id: 'memory', name: 'Memory backend', kind: 'pick-one',
  items: [
    { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
      detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
    { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
      detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
  ],
};

describe('ConflictPrompt', () => {
  it('renders the group name and conflicting items', () => {
    const { lastFrame } = render(
      <ConflictPrompt group={group} installedIds={['a', 'b']} onResolve={() => {}} />
    );
    expect(lastFrame()).toMatch(/Memory backend/);
    expect(lastFrame()).toMatch(/Conflict/i);
    expect(lastFrame()).toMatch(/A/);
    expect(lastFrame()).toMatch(/B/);
  });

  it('calls onResolve with cursor selection on enter', async () => {
    const onResolve = vi.fn();
    const { stdin } = render(
      <ConflictPrompt group={group} installedIds={['a', 'b']} onResolve={onResolve} />
    );
    stdin.write('\x1b[B');  // down
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r');        // enter
    await new Promise((r) => setTimeout(r, 30));
    expect(onResolve).toHaveBeenCalledWith('b');
  });
});
