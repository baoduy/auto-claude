import { describe, it, expect } from 'vitest';
import { App } from '../../src/ui/App.js';
import { render } from 'ink-testing-library';
import React from 'react';
import type { Catalog, InstallPlan } from '../../src/types.js';

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
    const { stdin } = render(
      React.createElement(App, {
        catalog,
        initialStates: [
          { itemId: 'claude-mem', installed: true },
          { itemId: 'mempalace', installed: false },
        ],
        repoRoot: null,
        onComplete: (r: { aborted?: boolean; plan?: InstallPlan }) => {
          if (r.plan) captured = r.plan;
        },
      }),
    );
    // No conflict (only one installed). select screen: cursor 0 = claude-mem (preselected).
    // Move down to mempalace, press space.
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x1b[B'); // down
    await new Promise((r) => setTimeout(r, 20));
    stdin.write(' '); // toggle mempalace
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // enter -> confirm screen
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // enter on confirm -> onComplete
    await new Promise((r) => setTimeout(r, 50));
    expect(captured).not.toBeNull();
    expect(captured!.selected.map((i) => i.id)).toEqual(['mempalace']);
    expect(captured!.uninstall?.map((i) => i.id)).toEqual(['claude-mem']);
  });

  it('out-of-band: both installed → conflict screen → keep mempalace → uninstall claude-mem', async () => {
    let captured: InstallPlan | null = null;
    const { stdin, lastFrame } = render(
      React.createElement(App, {
        catalog,
        initialStates: [
          { itemId: 'claude-mem', installed: true },
          { itemId: 'mempalace', installed: true },
        ],
        repoRoot: null,
        onComplete: (r: { aborted?: boolean; plan?: InstallPlan }) => {
          if (r.plan) captured = r.plan;
        },
      }),
    );
    // Conflict screen up. Cursor on claude-mem; press down to MemPalace, enter.
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/Conflict/);
    stdin.write('\x1b[B'); // down
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // select mempalace to keep
    await new Promise((r) => setTimeout(r, 20));
    // Now on select screen. Press enter to advance to confirm.
    stdin.write('\r'); // confirm screen
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r'); // enter on confirm -> onComplete
    await new Promise((r) => setTimeout(r, 50));
    expect(captured!.uninstall?.map((i) => i.id)).toContain('claude-mem');
    expect(captured!.selected.map((i) => i.id)).not.toContain('claude-mem');
  }, 15000);
});
