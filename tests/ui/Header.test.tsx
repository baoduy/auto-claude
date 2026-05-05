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

  it('compact variant renders one line containing "auto-claude" and the ✱ glyph', () => {
    const { lastFrame } = render(<Header variant="compact" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('auto-claude');
    expect(out).toContain('✱');
    expect(out.split('\n').filter((l) => l.trim().length > 0)).toHaveLength(1);
  });

  it('splash falls back to compact when terminal is narrower than 40 columns', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 30, configurable: true });
    const { lastFrame } = render(<Header variant="splash" />);
    const out = lastFrame() ?? '';
    expect(out).toContain('auto-claude');
    expect(out).not.toContain('curated tools & plugins for Claude Code');
  });

  it('renders nothing when stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const splash = render(<Header variant="splash" />);
    const compact = render(<Header variant="compact" />);
    expect((splash.lastFrame() ?? '').trim()).toBe('');
    expect((compact.lastFrame() ?? '').trim()).toBe('');
  });
});
