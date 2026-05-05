import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/ui/App.js';
import type { Catalog, EngineEvent, InstallPlan, InstallState } from '../../src/types.js';
import bundled from '../../src/catalog/bundled.json' with { type: 'json' };

const catalog = bundled as Catalog;
const states: InstallState[] = catalog.items.map((i) => ({ itemId: i.id, installed: false }));

describe('<App>', () => {
  it('starts on the selection screen and exits on q', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog} initialStates={states} repoRoot={null}
        runInstall={async () => {}} onComplete={onComplete}
      />
    );
    expect(lastFrame()).toContain('Tools');
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
    // Cursor at 0 (rtk, the only tool). Move down to a plugin then toggle. Order: tools first.
    // Easiest: navigate to bottom (3 down arrows), space, enter.
    await new Promise((r) => setTimeout(r, 10)); // wait for useInput to register
    stdin.write('\x1b[B'); // ↓
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\x1b[B');
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\x1b[B');
    await new Promise((r) => setTimeout(r, 10));
    stdin.write(' '); // toggle (last item, a plugin)
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\r'); // enter
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('How should plugins be installed?');
  });
});
