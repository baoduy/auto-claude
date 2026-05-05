import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { PluginScopePrompt } from '../../src/ui/PluginScopePrompt.js';

describe('<PluginScopePrompt>', () => {
  it('renders both options and highlights cursor', () => {
    const { lastFrame } = render(
      <PluginScopePrompt cursor={0} hasRepo={true} />
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Globally');
    expect(out).toContain('This project only');
  });

  it('hides project option when no repo', () => {
    const { lastFrame } = render(
      <PluginScopePrompt cursor={0} hasRepo={false} />
    );
    expect(lastFrame() ?? '').not.toContain('This project only');
  });
});
