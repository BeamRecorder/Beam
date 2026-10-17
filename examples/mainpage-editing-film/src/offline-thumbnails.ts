import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { ALL_FORMATS, BufferSource, CanvasSink, Input } from 'mediabunny';
import type { MediaAsset } from '@beam/engine/shared/composition-types';

/** Decode real source frames before capture; thumbnail workers must not race an offline seek. */
const entries = new Map<string, ReturnType<typeof source>>();
function source(url: string) {
  const thumbnails = ref<Record<number, string>>({}),
    widths = ref<Record<number, number>>({});
  const error = ref<string | null>(null);
  const pending = new Map<number, number>();
  const ready = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Recording thumbnails could not load their source.');
    const input = new Input({ source: new BufferSource(await response.arrayBuffer()), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) {
      input.dispose();
      throw new Error('Recording thumbnails cannot decode this video.');
    }
    return { input, track };
  })();
  let queue = Promise.resolve();
  let owners = 0,
    disposed = false;
  return {
    thumbnails,
    widths,
    error,
    retain() {
      owners++;
    },
    release() {
      if (--owners !== 0) return;
      disposed = true;
      entries.delete(url);
      void queue.then(() =>
        ready.then(
          ({ input }) => input.dispose(),
          () => undefined,
        ),
      );
    },
    request(times: number[], width: number) {
      for (const time of times) {
        if ((widths.value[time] ?? 0) >= width || (pending.get(time) ?? 0) >= width) continue;
        pending.set(time, width);
        queue = queue
          .then(async () => {
            if (disposed) return;
            const { track } = await ready;
            const sink = new CanvasSink(track, {
              poolSize: 1,
              width,
              decoderOptions: { hardwareAcceleration: 'prefer-software' },
            });
            const wrapped = await sink.getCanvas(Math.min(time, Math.max(0, (await track.computeDuration()) - 0.001)));
            if (!wrapped) throw new Error(`No thumbnail at ${time} seconds.`);
            thumbnails.value = {
              ...thumbnails.value,
              [time]: (wrapped.canvas as HTMLCanvasElement).toDataURL('image/png'),
            };
            widths.value = { ...widths.value, [time]: width };
            pending.delete(time);
          })
          .catch((reason) => {
            error.value = String(reason);
          });
      }
    },
    settle: async () => {
      await queue;
      if (error.value) throw new Error(error.value);
    },
  };
}
export async function settleThumbnails() {
  for (const entry of entries.values()) await entry.settle();
}
export function useThumbnails(asset: Ref<MediaAsset | null>) {
  const thumbnails = ref<Record<number, string>>({}),
    widths = ref<Record<number, number>>({}),
    error = ref<string | null>(null);
  let current: ReturnType<typeof source> | null = null;
  let stops: (() => void)[] = [];
  const release = () => {
    stops.forEach((stop) => stop());
    stops = [];
    current?.release();
    current = null;
  };
  watch(
    () => asset.value?.src,
    (url) => {
      release();
      if (!url) return;
      let entry = entries.get(url);
      if (!entry) {
        entry = source(url);
        entries.set(url, entry);
      }
      current = entry;
      entry.retain();
      stops = [
        watch(
          entry.thumbnails,
          (value) => {
            thumbnails.value = value;
          },
          { immediate: true },
        ),
        watch(
          entry.widths,
          (value) => {
            widths.value = value;
          },
          { immediate: true },
        ),
        watch(
          entry.error,
          (value) => {
            error.value = value;
          },
          { immediate: true },
        ),
      ];
    },
    { immediate: true },
  );
  onScopeDispose(release);
  return {
    thumbnails,
    widths,
    error,
    requestVisibleFrames: (times: number[], width: number) => current?.request(times, width),
  };
}
