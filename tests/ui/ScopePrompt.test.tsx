import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ScopePrompt, type ScopeKindGroup } from '../../src/ui/ScopePrompt.js';

const both: ScopeKindGroup[] = [
  { kind: 'plugin', label: 'Plugins', installs: ['superpowers'], uninstalls: ['claude-mem'] },
  { kind: 'mcp', label: 'MCP servers', installs: ['context7'], uninstalls: [] },
];

describe('<ScopePrompt>', () => {
  it('renders both options and highlights cursor', () => {
    const { lastFrame } = render(
      <ScopePrompt cursor={0} hasRepo={true} groups={both} />
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Globally');
    expect(out).toContain('This project only');
  });

  it('hides project option when no repo', () => {
    const { lastFrame } = render(
      <ScopePrompt cursor={0} hasRepo={false} groups={both} />
    );
    expect(lastFrame() ?? '').not.toContain('This project only');
  });

  it('shows kind headings only when items are present', () => {
    const { lastFrame } = render(
      <ScopePrompt
        cursor={0}
        hasRepo={true}
        groups={[
          { kind: 'plugin', label: 'Plugins', installs: ['superpowers'], uninstalls: [] },
          { kind: 'mcp', label: 'MCP servers', installs: [], uninstalls: [] },
        ]}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Plugins');
    expect(out).toContain('superpowers');
    // "MCP servers" appears once in the title; the kind section heading
    // should NOT render an additional occurrence when the group is empty.
    expect(out.match(/MCP servers/g)?.length ?? 0).toBe(1);
  });

  it('lists installs (with +) and uninstalls (with will uninstall) under each kind', () => {
    const { lastFrame } = render(
      <ScopePrompt cursor={1} hasRepo={true} groups={both} />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('superpowers');
    expect(out).toContain('claude-mem');
    expect(out).toContain('will uninstall');
    expect(out).toContain('context7');
  });

  it('omits the Selected block when no plugins or mcps are in the plan', () => {
    const { lastFrame } = render(
      <ScopePrompt cursor={0} hasRepo={true} groups={[]} />,
    );
    expect(lastFrame() ?? '').not.toContain('Selected:');
  });
});
