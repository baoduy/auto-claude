import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/ui/App.js';
import type { Catalog, EngineEvent, InstallPlan, InstallState } from '../../src/types.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };

const catalog = bundled as Catalog;
const states: InstallState[] = catalog.items.map((i) => ({ itemId: i.id, installed: false }));

describe('<App>', () => {
  let originalIsTTY: boolean | undefined;
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
  });
  it('starts on the selection screen and exits on q', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog} initialStates={states} repoRoot={null}
        runInstall={async () => {}} onComplete={onComplete}
      />
    );
    expect(lastFrame()).toContain('Tools');
    expect(lastFrame()).toMatch(/claude|auto-claude/i);
    await new Promise((r) => setTimeout(r, 10)); // wait for useInput to register
    stdin.write('q');
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).toHaveBeenCalledWith({ aborted: true });
  });

  it('selecting an item, then enter, advances to scope prompt when plugin selected', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog} initialStates={states} repoRoot={'/repo'}
        runInstall={async () => {}} onComplete={onComplete}
      />
    );
    // Cursor at 0 (rtk, a tool). Move down to a plugin then toggle. Order: tools first, then plugins.
    // Tools: rtk, graphify, gitnexus, context-mode, snip, codeburn (6 total).
    // First plugin is at cursor 6. Navigate down 6 times, space, enter.
    await new Promise((r) => setTimeout(r, 10)); // wait for useInput to register
    for (let i = 0; i < 6; i++) {
      stdin.write('\x1b[B'); // ↓
      await new Promise((r) => setTimeout(r, 10));
    }
    stdin.write(' '); // toggle (first plugin)
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\r'); // enter
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toMatch(/claude|auto-claude/i);
    expect(lastFrame()).toContain('How should plugins be installed?');
  });
});
