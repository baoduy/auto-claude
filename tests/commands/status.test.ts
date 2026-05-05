import { describe, it, expect } from 'vitest';
import { renderStatus } from '../../src/commands/status.js';
import type { CatalogItem, InstallState } from '../../src/types.js';

const items: CatalogItem[] = [
  { id: 'a', name: 'a', description: '', kind: 'tool', defaultScope: 'global',
    detect: { command: 'a -v' }, install: { command: '' } },
  { id: 'b', name: 'b', description: '', kind: 'plugin', defaultScope: 'global',
    detect: { command: 'b -v' }, install: { command: '' } },
];
const states: InstallState[] = [
  { itemId: 'a', installed: true, version: 'a 1.0.0' },
  { itemId: 'b', installed: false },
];

describe('renderStatus', () => {
  it('renders one line per item with badge and version', () => {
    const out = renderStatus(items, states);
    expect(out).toContain('a');
    expect(out).toContain('installed');
    expect(out).toContain('a 1.0.0');
    expect(out).toContain('b');
    expect(out).toContain('missing');
  });
});
