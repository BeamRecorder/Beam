import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHtmlThumbnailServices } from '../html-thumbnail-services';
import type { HtmlComposition } from '@beam/engine/html/html-types';

const state = vi.hoisted(() => ({
  render: vi.fn(async () => new Blob(['thumbnail'])),
  dispose: vi.fn(),
  sources: vi.fn(),
  source: null as null | (() => Promise<string>),
  worker: vi.fn(),
}));
vi.mock('@beam/runtime/html/html-thumbnail.worker?worker', () => ({
  default: class {
    constructor() {
      state.worker();
    }
  },
}));
vi.mock('@beam/runtime/html/html-thumbnail-client', () => ({
  createHtmlThumbnailClient: (_worker: unknown, source: () => Promise<string>) => {
    state.source = source;
    return { render: state.render, dispose: state.dispose };
  },
}));
vi.mock('~/api/capture', () => ({ capture: { getHtmlFrameSources: state.sources } }));

const html = { id: 'source', width: 1920, height: 1080 } as HtmlComposition;

describe('desktop HTML thumbnail worker services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sources.mockResolvedValue([{ url: 'http://127.0.0.1/frame/capability' }]);
  });

  it('creates a dedicated worker and preserves the composition aspect ratio', async () => {
    const services = createHtmlThumbnailServices(html);
    expect(state.worker).toHaveBeenCalledOnce();
    await expect(services.render(1500, 240)).resolves.toBeInstanceOf(Blob);
    expect(state.render).toHaveBeenCalledWith(1500, 240, 135);
    await expect(state.source!()).resolves.toBe('http://127.0.0.1/frame/capability');
    expect(state.sources).toHaveBeenCalledWith([{ id: 'source', html }]);
  });

  it('rejects an unavailable source and propagates capability errors', async () => {
    createHtmlThumbnailServices(html);
    state.sources.mockResolvedValueOnce([]);
    await expect(state.source!()).rejects.toThrow('source unavailable');
    state.sources.mockRejectedValueOnce(new Error('editor closed'));
    await expect(state.source!()).rejects.toThrow('editor closed');
  });

  it('releases object URLs and the worker and bounds short composition heights', async () => {
    const create = vi.fn(() => 'blob:thumbnail'),
      revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    try {
      const services = createHtmlThumbnailServices({ ...html, height: 1 });
      const blob = new Blob(['image']);
      expect(services.createUrl(blob)).toBe('blob:thumbnail');
      services.revokeUrl('blob:thumbnail');
      expect(create).toHaveBeenCalledWith(blob);
      expect(revoke).toHaveBeenCalledWith('blob:thumbnail');
      await services.render(0, 240);
      expect(state.render).toHaveBeenCalledWith(0, 240, 1);
      services.dispose();
      expect(state.dispose).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
