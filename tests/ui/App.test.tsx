import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../../src/ui/App.js';
import type { Catalog, CatalogItem, InstallPlan, InstallState } from '../../src/types.js';
import { flattenItems } from '../../src/catalog/groups.js';
import bundled from '../../catalog.json' with { type: 'json' };

const catalog = bundled as Catalog;
const states: InstallState[] = flattenItems(catalog).map((i) => ({ itemId: i.id, installed: false }));

describe('<App>', () => {
  let originalIsTTY: boolean | undefined;
  let originalColumns: number | undefined;
  let originalRows: number | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
    originalRows = process.stdout.rows;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: 30, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: originalRows, configurable: true });
  });
  it('starts on the selection screen and exits on q', async () => {
    const onComplete = vi.fn();
    const { stdin, lastFrame } = render(
      <App
        catalog={catalog} initialStates={states} repoRoot={null}
        onComplete={onComplete}
      />
    );
    expect(lastFrame()).toMatch(/Tools\s*\(1\//);
    expect(lastFrame()).toMatch(/claude|auto-claude/i);
    await new Promise((r) => setTimeout(r, 10)); // wait for useInput to register
    stdin.write('q');
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).toHaveBeenCalledWith({ aborted: true });
  });

  it('walks all kind pages and advances to scope when a plugin is selected', async () => {
    const onComplete = vi.fn();
    const fixture: Catalog = {
      version: 2, updatedAt: '2026-05-07',
      groups: [
        { id: 'g-tool', name: 'Tools', kind: 'pick-many', items: [
          { id: 't1', name: 't1', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
        ]},
        { id: 'g-plugin', name: 'Plugins', kind: 'pick-many', items: [
          { id: 'p1', name: 'p1', description: '', kind: 'plugin', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
        ]},
      ],
    };
    const fState: InstallState[] = [
      { itemId: 't1', installed: false },
      { itemId: 'p1', installed: false },
    ];
    const { stdin, lastFrame } = render(
      <App catalog={fixture} initialStates={fState} repoRoot={'/repo'}
           onComplete={onComplete} />
    );
    await new Promise((r) => setTimeout(r, 10));
    // Tools page: don't toggle, just advance.
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    // Plugins page: toggle p1, then advance.
    stdin.write(' ');
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toContain('How should plugins');
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
        onComplete={(r) => { if (r.plan) received = r.plan; }}
      />,
    );
    stdin.write(' ');         // select a
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\x1b[B');  // down
    await new Promise((r) => setTimeout(r, 20));
    stdin.write(' ');         // select b (should deselect a)
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter -> confirm screen
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter on confirm -> onComplete
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
        onComplete={(r) => { if (r.plan) received = r.plan; }}
      />,
    );
    stdin.write('\x1b[B');  // down to b
    await new Promise((r) => setTimeout(r, 20));
    stdin.write(' ');         // select b
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter -> confirm screen
    await new Promise((r) => setTimeout(r, 20));
    stdin.write('\r');        // enter on confirm -> onComplete
    await new Promise((r) => setTimeout(r, 100));
    const plan = received as InstallPlan | null;
    expect(plan?.selected.map((i: CatalogItem) => i.id)).toEqual(['b']);
    expect(plan?.uninstall?.map((i: CatalogItem) => i.id)).toEqual(['a']);
  });

  it('back navigation returns to the previous kind page', async () => {
    const onComplete = vi.fn();
    const fixture: Catalog = {
      version: 2, updatedAt: '2026-05-07',
      groups: [
        { id: 'g-tool', name: 'Tools', kind: 'pick-many', items: [
          { id: 't1', name: 't1', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
        ]},
        { id: 'g-plugin', name: 'Plugins', kind: 'pick-many', items: [
          { id: 'p1', name: 'p1', description: '', kind: 'plugin', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
        ]},
      ],
    };
    const { stdin, lastFrame } = render(
      <App catalog={fixture}
           initialStates={[{ itemId: 't1', installed: false }, { itemId: 'p1', installed: false }]}
           repoRoot={'/repo'} onComplete={onComplete} />
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toMatch(/Tools\s*\(1\/2\)/);
    stdin.write('\r'); // advance to plugins
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toMatch(/Plugins\s*\(2\/2\)/);
    stdin.write('\x1b[D'); // ESC [ D = left arrow
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFrame()).toMatch(/Tools\s*\(1\/2\)/);
  });

  it('skips empty kind pages — no tools means breadcrumb starts at plugins', async () => {
    const fixture: Catalog = {
      version: 2, updatedAt: '2026-05-07',
      groups: [
        { id: 'g-plugin', name: 'Plugins', kind: 'pick-many', items: [
          { id: 'p1', name: 'p1', description: '', kind: 'plugin', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
        ]},
      ],
    };
    const { lastFrame } = render(
      <App catalog={fixture}
           initialStates={[{ itemId: 'p1', installed: false }]}
           repoRoot={'/repo'} onComplete={() => {}} />
    );
    await new Promise((r) => setTimeout(r, 10));
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/Plugins\s*\(1\/1\)/);
    expect(frame).not.toMatch(/Tools/);
    expect(frame).not.toMatch(/MCP/);
  });

  it('a mixed-kind pick-one group is rendered on its assigned page and still mutually-excludes siblings', async () => {
    let received: InstallPlan | null = null;
    const fixture: Catalog = {
      version: 2, updatedAt: '2026-05-07',
      groups: [
        { id: 'mem', name: 'Memory', kind: 'pick-one', page: 'plugin', items: [
          { id: 'm-plugin', name: 'm-plugin', description: '', kind: 'plugin', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
          { id: 'm-tool', name: 'm-tool', description: '', kind: 'tool', defaultScope: 'global',
            detect: { command: 'true' }, install: { command: 'true' } },
        ]},
      ],
    };
    const { stdin } = render(
      <App catalog={fixture}
           initialStates={[{ itemId: 'm-plugin', installed: false }, { itemId: 'm-tool', installed: false }]}
           repoRoot={'/repo'}
           onComplete={(r) => { if (r.plan) received = r.plan; }} />
    );
    await new Promise((r) => setTimeout(r, 10));
    // Single page = plugin. Toggle first item (m-plugin), then ↓ + space (m-tool) to flip the pick-one.
    stdin.write(' ');
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\x1b[B'); // down
    await new Promise((r) => setTimeout(r, 10));
    stdin.write(' ');
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\r'); // enter — last page, has plugins so goes to scope
    await new Promise((r) => setTimeout(r, 10));
    // Choose scope (global) and confirm.
    stdin.write('\r'); // scope = global
    await new Promise((r) => setTimeout(r, 10));
    stdin.write('\r'); // confirm -> onComplete
    await new Promise((r) => setTimeout(r, 50));
    expect(received).not.toBeNull();
    const ids = (received as unknown as InstallPlan).selected.map((i) => i.id);
    expect(ids).toContain('m-tool');
    expect(ids).not.toContain('m-plugin');
  });
});
