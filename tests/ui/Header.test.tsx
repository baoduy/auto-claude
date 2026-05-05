import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Header } from '../../src/ui/Header.js';

describe('<Header>', () => {
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

  it('splash variant renders multi-line figlet output and the tagline', () => {
    const { lastFrame } = render(<Header variant="splash" />);
    const out = lastFrame() ?? '';
    expect(out.split('\n').length).toBeGreaterThanOrEqual(3);
    expect(out).toContain('curated tools & plugins for Claude Code');
  });
});
