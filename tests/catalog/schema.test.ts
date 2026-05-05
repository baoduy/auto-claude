import { describe, it, expect } from 'vitest';
import { CatalogSchema } from '../../src/catalog/schema.js';

describe('CatalogSchema', () => {
  const valid = {
    version: 1,
    updatedAt: '2026-05-05',
    items: [{
      id: 'rtk',
      name: 'rtk',
      description: 'token proxy',
      kind: 'tool',
      defaultScope: 'global',
      detect: { command: 'rtk --version' },
      install: { command: 'npm i -g rtk' },
    }],
  };

  it('accepts a minimal valid catalog', () => {
    expect(() => CatalogSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown kind', () => {
    const bad = { ...valid, items: [{ ...valid.items[0], kind: 'addon' }] };
    expect(() => CatalogSchema.parse(bad)).toThrow();
  });

  it('rejects missing detect.command', () => {
    const bad = { ...valid, items: [{ ...valid.items[0], detect: {} }] };
    expect(() => CatalogSchema.parse(bad)).toThrow();
  });

  it('accepts optional postInstall actions', () => {
    const ok = {
      ...valid,
      items: [{
        ...valid.items[0],
        postInstall: [{ type: 'shell', value: 'rtk init -g', requiresRepo: true }],
      }],
    };
    expect(() => CatalogSchema.parse(ok)).not.toThrow();
  });
});
