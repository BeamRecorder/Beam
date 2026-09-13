import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapturePreview, CaptureSource } from '../../api/types/capture-api';
import { loadNativeSourcePreviews } from './native-source-previews';

const source = (id: string, label = id): CaptureSource => ({
  id,
  kind: 'window',
  label,
  isDefault: false,
  selectionMode: 'direct',
});

const readyPreview = (sourceId: string, thumbnail = `thumbnail:${sourceId}`) => ({
  sourceId,
  thumbnail,
  status: 'ready' as const,
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadNativeSourcePreviews', () => {
  it('keeps previews attached to exact source ids instead of array positions', async () => {
    const first = source('sck:window:101', 'Editor');
    const second = source('sck:window:202', 'Browser');
    const getSourcePreview = vi.fn(async ({ sourceId }: { sourceId: string }) => {
      if (sourceId === first.id) return readyPreview(second.id, 'wrong-source');
      return readyPreview(second.id, 'browser-thumbnail');
    });

    const previews = await loadNativeSourcePreviews({ getSourcePreview }, [first, second], [], false);

    expect(getSourcePreview.mock.calls.map(([request]) => request.sourceId)).toEqual([first.id, second.id]);
    expect(previews).toEqual([
      {
        id: second.id,
        name: second.label,
        thumbnail: 'browser-thumbnail',
        appIcon: null,
        displayId: undefined,
      },
    ]);
  });

  it('preserves the last good preview when a refresh returns unavailable', async () => {
    const existing: CapturePreview = {
      id: 'sck:window:303',
      name: 'Old title',
      thumbnail: 'last-good-thumbnail',
      appIcon: 'last-good-icon',
      displayId: 'display-1',
    };
    const current = source(existing.id, 'Editor — Beam');
    const getSourcePreview = vi.fn().mockResolvedValue({
      sourceId: current.id,
      thumbnail: null,
      status: 'unavailable',
    });

    const previews = await loadNativeSourcePreviews({ getSourcePreview }, [current], [existing], true);

    expect(previews).toEqual([
      {
        ...existing,
        name: current.label,
        displayId: undefined,
      },
    ]);
    expect(getSourcePreview).toHaveBeenCalledWith({
      sourceId: current.id,
      maxWidth: 300,
      maxHeight: 200,
      refresh: true,
    });
  });

  it('limits native captures to two globally across simultaneous loader calls', async () => {
    const firstSources = [source('sck:window:401'), source('sck:window:402')];
    const secondSources = [source('sck:window:501'), source('sck:window:502')];
    const pending = new Map<string, (result: ReturnType<typeof readyPreview>) => void>();
    let active = 0;
    let maxActive = 0;
    const getSourcePreview = vi.fn(({ sourceId }: { sourceId: string }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<ReturnType<typeof readyPreview>>((resolve) => {
        pending.set(sourceId, (result) => {
          pending.delete(sourceId);
          active -= 1;
          resolve(result);
        });
      });
    });

    const firstLoad = loadNativeSourcePreviews({ getSourcePreview }, firstSources, [], false);
    const secondLoad = loadNativeSourcePreviews({ getSourcePreview }, secondSources, [], false);
    const allLoads = Promise.all([firstLoad, secondLoad]);

    for (let attempt = 0; attempt < 12 && (getSourcePreview.mock.calls.length < 4 || pending.size > 0); attempt += 1) {
      await flush();
      const [sourceId] = pending.keys();
      if (sourceId) pending.get(sourceId)?.(readyPreview(sourceId));
    }

    const [firstPreviews, secondPreviews] = await allLoads;
    expect(getSourcePreview).toHaveBeenCalledTimes(4);
    expect(maxActive).toBe(2);
    expect(active).toBe(0);
    expect(firstPreviews.map((preview) => preview.id)).toEqual(firstSources.map((item) => item.id));
    expect(secondPreviews.map((preview) => preview.id)).toEqual(secondSources.map((item) => item.id));
  });
});
