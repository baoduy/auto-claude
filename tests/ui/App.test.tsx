import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/ui/App.js';
import type { Catalog, CatalogItem, EngineEvent, InstallPlan, InstallState } from '../../src/types.js';
import { flattenItems } from '../../src/catalog/groups.js';
import bundled from '../../catalog.json' with { type: 'json' };

const catalog = bundled as Catalog;
const states: InstallState[] = flattenItems(catalog).map((i) => ({ itemId: i.id, installed: false }));

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
    expect(lastFrame()).toContain('Memory backend');
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
    // Cursor at 0 (claude-mem, a plugin). Toggle it, then enter.
    await new Promise((r) => setTimeout(r, 10)); // wait for useInput to register
    stdin.write(' '); // toggle (first item is already a plugin)
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\r'); // enter
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toMatch(/claude|auto-claude/i);
    expect(lastFrame()).toContain('How should plugins be installed?');
  }, 15000);

  it('pick-one selection deselects siblings', async () => {
    const catalog: Catalog = {
      version: 2, updatedAt: '2026-05-05',
      groups: [{
        id: 'memory', name: 'Memory backend', kind: 'pick-one',
        items: [
          { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
          { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
        ],
      }],
    };
    let received: InstallPlan | null = null;
    const { stdin } = render(
      <App
        catalog={catalog}
        initialStates={[{ itemId: 'a', installed: false }, { itemId: 'b', installed: false }]}
        repoRoot={null}
        runInstall={async (plan) => { received = plan; }}
        onComplete={() => {}}
      />,
    );
    stdin.write(' ');         // select a
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x1b[B');  // down
    await new Promise((r) => setTimeout(r, 20));
    stdin.write(' ');         // select b (should deselect a)
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter -> confirm
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter -> run
    await new Promise((r) => setTimeout(r, 100));
    expect((received as InstallPlan | null)?.selected.map((i: CatalogItem) => i.id)).toEqual(['b']);
  });

  it('omits mcp items from the wizard when repoRoot is null', () => {
    const mcpCatalog: Catalog = {
      version: 2 as const,
      updatedAt: '2026-05-05',
      groups: [{
        id: 'mcp-servers', name: 'MCP servers (project)', kind: 'pick-many' as const,
        items: [{
          id: 'foo-mcp', name: 'Foo', description: '', kind: 'mcp' as const,
          mcpKey: 'foo', mcpServer: { command: 'x' },
        }],
      }],
    };
    const { lastFrame } = render(
      <App
        catalog={mcpCatalog}
        initialStates={[]}
        repoRoot={null}
        runInstall={async () => {}}
        onComplete={() => {}}
      />
    );
    expect(lastFrame()).not.toContain('foo-mcp');
    expect(lastFrame()).toContain('MCP items require a project');
  });

  it('auto-swap: selecting B in same group when A is installed queues A for uninstall', async () => {
    const catalog: Catalog = {
      version: 2, updatedAt: '2026-05-05',
      groups: [{
        id: 'memory', name: 'Memory backend', kind: 'pick-one',
        items: [
          { id: 'a', name: 'A', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
          { id: 'b', name: 'B', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' }, uninstall: { command: 'true' } },
        ],
      }],
    };
    let received: InstallPlan | null = null;
    const { stdin } = render(
      <App
        catalog={catalog}
        initialStates={[{ itemId: 'a', installed: true }, { itemId: 'b', installed: false }]}
        repoRoot={null}
        runInstall={async (plan) => { received = plan; }}
        onComplete={() => {}}
      />,
    );
    stdin.write('\x1b[B');  // down to b
    await new Promise((r) => setTimeout(r, 20));
    stdin.write(' ');         // select b
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter -> confirm
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter -> run
    await new Promise((r) => setTimeout(r, 100));
    const plan = received as InstallPlan | null;
    expect(plan?.selected.map((i: CatalogItem) => i.id)).toEqual(['b']);
    expect(plan?.uninstall?.map((i: CatalogItem) => i.id)).toEqual(['a']);
  });
});
