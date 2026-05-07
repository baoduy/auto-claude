import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfirmSummary } from '../../src/ui/ConfirmSummary.js';
import { ProgressLog } from '../../src/ui/ProgressLog.js';
import { PostInstallPanel } from '../../src/ui/PostInstallPanel.js';
import type { EngineEvent } from '../../src/types.js';

describe('<ConfirmSummary>', () => {
  it('renders grouped actions with scope suffix on plugin/mcp headings', () => {
    const { lastFrame } = render(
      <ConfirmSummary
        groups={[
          { kind: 'tool', label: 'Tools', actions: [{ verb: 'Install', name: 'rtk' }] },
          {
            kind: 'plugin',
            label: 'Plugins',
            scopeSuffix: ' (global)',
            actions: [{ verb: 'Install', name: 'superpowers' }],
          },
          { kind: 'mcp', label: 'MCP servers', scopeSuffix: ' (global)', actions: [] },
        ]}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Tools');
    expect(out).toContain('Install rtk');
    expect(out).toContain('Plugins');
    expect(out).toContain('(global)');
    expect(out).toContain('Install superpowers');
    // MCP servers heading suppressed when no actions
    expect(out).not.toContain('MCP servers');
  });
});

describe('<ProgressLog>', () => {
  it('renders one line per item-start with status', () => {
    const events: EngineEvent[] = [
      { type: 'item-start', itemId: 'a', label: 'A', index: 1, total: 2 },
      { type: 'item-success', itemId: 'a' },
      { type: 'item-start', itemId: 'b', label: 'B', index: 2, total: 2 },
    ];
    const { lastFrame } = render(<ProgressLog events={events} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('A');
    expect(out).toContain('B');
    expect(out).toContain('✓');
  });
});

describe('<PostInstallPanel>', () => {
  it('shows claude-prompt actions and a done message', () => {
    const events: EngineEvent[] = [
      { type: 'post-prompt', itemId: 'csu', label: 'Trigger automation recommender',
        value: 'Ask Claude: recommend automations for this project' },
      { type: 'done' },
    ];
    const { lastFrame } = render(<PostInstallPanel events={events} />);
    const out = lastFrame() ?? '';
    expect(out).toContain('Done');
    expect(out).toContain('recommend automations');
  });
});
