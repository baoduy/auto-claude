import { describe, it, expect, vi } from 'vitest';
import { App } from '../../src/ui/App.js';
import { render } from 'ink-testing-library';
import React from 'react';
import type { Catalog, EngineEvent, InstallPlan } from '../../src/types.js';

const catalog: Catalog = {
  version: 2, updatedAt: '2026-05-05',
  groups: [{
    id: 'memory', name: 'Memory backend', kind: 'pick-one',
    items: [
      { id: 'claude-mem', name: 'claude-mem', description: '', kind: 'plugin', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' }, uninstall: { command: 't' } },
      { id: 'mempalace', name: 'MemPalace', description: '', kind: 'tool', defaultScope: 'global',
        detect: { command: 't' }, install: { command: 't' }, uninstall: { command: 't' } },
    ],
  }],
};

describe('e2e: memory swap', () => {
  it('selecting MemPalace when claude-mem is installed produces a plan that uninstalls claude-mem and installs MemPalace', async () => {
    let captured: InstallPlan | null = null;
    const runInstall = vi.fn(async (plan: InstallPlan, _onEvent?: (e: EngineEvent) => void) => {
      captured = plan;
    });
    const { stdin } = render(
      React.createElement(App, {
        catalog,
        initialStates: [
          { itemId: 'claude-mem', installed: true },
          { itemId: 'mempalace', installed: false },
        ],
        repoRoot: null,
        runInstall,
        onComplete: () => {},
      }),
    );
    // No conflict (only one installed). select screen: cursor 0 = claude-mem (preselected).
    // Move down to mempalace, press space.
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x1b[B'); // down
    await new Promise((r) => setTimeout(r, 20));
    stdin.write(' '); // toggle mempalace
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // confirm
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // run
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).not.toBeNull();
    expect(captured!.selected.map((i) => i.id)).toEqual(['mempalace']);
    expect(captured!.uninstall?.map((i) => i.id)).toEqual(['claude-mem']);
  });

  it('out-of-band: both installed → conflict screen → keep mempalace → uninstall claude-mem', async () => {
    let captured: InstallPlan | null = null;
    const runInstall = vi.fn(async (plan: InstallPlan) => { captured = plan; });
    const { stdin, lastFrame } = render(
      React.createElement(App, {
        catalog,
        initialStates: [
          { itemId: 'claude-mem', installed: true },
          { itemId: 'mempalace', installed: true },
        ],
        repoRoot: null,
        runInstall,
        onComplete: () => {},
      }),
    );
    // Conflict screen up. Cursor on claude-mem; press down to MemPalace, enter.
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/Conflict/);
    stdin.write('\x1b[B'); // down
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // select mempalace to keep
    await new Promise((r) => setTimeout(r, 20));
    // Now on select screen. Press enter to confirm everything.
    stdin.write('\r'); // confirm
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // run
    await new Promise((r) => setTimeout(r, 50));
    expect(captured!.uninstall?.map((i) => i.id)).toContain('claude-mem');
    expect(captured!.selected.map((i) => i.id)).not.toContain('claude-mem');
  });
});
