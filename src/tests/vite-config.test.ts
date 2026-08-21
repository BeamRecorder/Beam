import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfigFromFile } from 'vite';

describe('Vite development configuration', () => {
  it('pre-bundles the AAC encoder before the first export', async () => {
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, resolve('vite.config.ts'));

    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error('Vite configuration could not be loaded');
    expect(loaded.config.optimizeDeps?.include).toContain('@mediabunny/aac-encoder');
  });

  it('deduplicates Vue across Vite dependency entry points', async () => {
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, resolve('vite.config.ts'));

    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error('Vite configuration could not be loaded');
    expect(loaded.config.resolve?.dedupe).toContain('vue');
  });
});
