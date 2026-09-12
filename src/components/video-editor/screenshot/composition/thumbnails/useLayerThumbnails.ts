import { onScopeDispose, shallowRef, watch } from 'vue';
import { cursorGeometry } from '../../../properties/cursor/cursor-packs';
import { CURSOR_SIZE_MAX } from '../../../properties/cursor/cursor-size';
import { loadCursorImage } from '../../../properties/cursor/cursor-image-loader';
import type { LayerThumbnail, ThumbnailReply, ThumbnailRequest, ThumbnailSpec } from './thumbnail-types';

export function useLayerThumbnails(specs: () => ThumbnailSpec[]) {
  const thumbnails = shallowRef<Record<string, LayerThumbnail>>({});
  const keys = new Map<string, string>();
  const pending = new Map<string, ThumbnailSpec>();
  let revision = 0,
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | undefined;
  const update = (id: string, value: LayerThumbnail) => {
    thumbnails.value = { ...thumbnails.value, [id]: value };
  };
  const fail = (id: string, version: number, error: string) => {
    if (!disposed && thumbnails.value[id]?.revision === version)
      update(id, { status: 'error', revision: version, error });
  };
  const getWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<ThumbnailReply>) => {
      if (disposed || thumbnails.value[data.id]?.revision !== data.revision) return;
      if (data.error !== undefined) {
        fail(data.id, data.revision, data.error);
        return;
      }
      update(data.id, { status: 'ready', revision: data.revision, url: URL.createObjectURL(data.blob) });
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = undefined;
      for (const [id, value] of Object.entries(thumbnails.value))
        if (value.status === 'loading') fail(id, value.revision, 'Thumbnail worker failed.');
    };
    return worker;
  };
  const send = async (spec: ThumbnailSpec, version: number) => {
    let bitmap: ImageBitmap | undefined;
    try {
      const state = JSON.parse(JSON.stringify(spec.state)) as ThumbnailSpec['state'];
      if (spec.layer.kind === 'cursor') {
        if (!spec.cursorPack || !spec.cursorAsset) throw new Error('Cursor pack unavailable.');
        const cursor = state.cursors![0]!;
        const raster = cursorGeometry(
          spec.cursorAsset,
          (CURSOR_SIZE_MAX * Math.min(state.canvas.width, state.canvas.height)) / 1080,
        );
        const image = await loadCursorImage(
          spec.cursorPack,
          spec.cursorAsset,
          Math.max(1, raster.width),
          Math.max(1, raster.height),
          cursor.color,
        );
        bitmap = await createImageBitmap(image);
      }
      if (disposed || thumbnails.value[spec.id]?.revision !== version) {
        bitmap?.close();
        return;
      }
      const request: ThumbnailRequest = {
        id: spec.id,
        revision: version,
        state,
        layer: { ...spec.layer },
        sourceUrl: spec.sourceUrl,
        cursorAsset: spec.cursorAsset ? JSON.parse(JSON.stringify(spec.cursorAsset)) : undefined,
        bitmap,
      };
      getWorker().postMessage(request, bitmap ? [bitmap] : []);
    } catch (reason) {
      bitmap?.close();
      fail(spec.id, version, reason instanceof Error ? reason.message : String(reason));
    }
  };
  watch(
    specs,
    (next) => {
      let changed = false;
      const ids = new Set(next.map((item) => item.id));
      const values = { ...thumbnails.value };
      for (const [id, value] of Object.entries(values))
        if (!ids.has(id)) {
          changed = true;
          if (value.url) URL.revokeObjectURL(value.url);
          delete values[id];
          keys.delete(id);
          pending.delete(id);
        }
      for (const spec of next) {
        if (keys.get(spec.id) === spec.key) continue;
        changed = true;
        keys.set(spec.id, spec.key);
        if (values[spec.id]?.url) URL.revokeObjectURL(values[spec.id]!.url!);
        values[spec.id] = { status: 'loading', revision: ++revision };
        pending.set(spec.id, spec);
      }
      if (!changed) return;
      thumbnails.value = values;
      if (pending.size) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const requests = [...pending.values()];
          pending.clear();
          for (const spec of requests) void send(spec, thumbnails.value[spec.id]!.revision);
        }, 80);
      }
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    clearTimeout(timer);
    pending.clear();
    worker?.terminate();
    for (const value of Object.values(thumbnails.value)) if (value.url) URL.revokeObjectURL(value.url);
  });
  return thumbnails;
}
