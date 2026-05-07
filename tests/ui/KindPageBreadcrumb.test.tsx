import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { KindPageBreadcrumb } from '../../src/ui/KindPageBreadcrumb.js';

describe('<KindPageBreadcrumb>', () => {
  it('renders all active kinds with current marked (i/N)', () => {
    const { lastFrame } = render(
      <KindPageBreadcrumb kinds={['tool', 'plugin', 'mcp']} index={1} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toMatch(/Tools/);
    expect(frame).toMatch(/Plugins\s*\(2\/3\)/);
    expect(frame).toMatch(/MCP/);
  });

  it('shows (1/2) on a two-kind flow', () => {
    const { lastFrame } = render(
      <KindPageBreadcrumb kinds={['tool', 'plugin']} index={0} />
    );
    expect(lastFrame() ?? '').toMatch(/Tools\s*\(1\/2\)/);
  });

  it('omits kinds that are not in the active list', () => {
    const { lastFrame } = render(
      <KindPageBreadcrumb kinds={['plugin']} index={0} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/Tools/);
    expect(frame).not.toMatch(/MCP/);
    expect(frame).toMatch(/Plugins\s*\(1\/1\)/);
  });
});
