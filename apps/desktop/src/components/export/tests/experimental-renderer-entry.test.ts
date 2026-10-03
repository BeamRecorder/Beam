import { afterEach, describe, expect, it, vi } from 'vitest';
const render = vi.hoisted(() => vi.fn());
vi.mock('@beam/encoder/gpu-export/experimental-renderer', () => ({ renderExperimentalExport: render }));
afterEach(() => {
  delete window.gpuExport;
  vi.resetModules();
  render.mockReset();
});
describe('isolated GPU renderer entry', () => {
  it('requires its dedicated preload', async () => {
    await expect(import('../experimental-renderer-entry')).rejects.toThrow('preload is unavailable');
  });
  it('starts the renderer with its narrow API', async () => {
    window.gpuExport = { error: vi.fn() } as unknown as NonNullable<Window['gpuExport']>;
    render.mockResolvedValue(undefined);
    await import('../experimental-renderer-entry');
    expect(render).toHaveBeenCalledWith(window.gpuExport);
  });
  it.each([new Error('GPU lost'), 'unknown error'])(
    'reports renderer failure %s through the preload',
    async (error) => {
      const report = vi.fn();
      window.gpuExport = { error: report } as unknown as NonNullable<Window['gpuExport']>;
      render.mockRejectedValue(error);
      await import('../experimental-renderer-entry');
      await Promise.resolve();
      expect(report).toHaveBeenCalledWith(error instanceof Error ? error.message : error);
    },
  );
});
