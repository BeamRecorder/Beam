import { computed, inject, onScopeDispose, ref, watch } from 'vue';
import { sourceTimeAt } from '@beam/runtime/shared/index';
import { loadElementFonts } from '@beam/runtime/shared/element-font-loader';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { timelineCanvasRegistryKey } from '../timeline-canvas-registry';
import { useThumbnails } from '../waveform/useThumbnails';
import { thumbnailIsPending, thumbnailUrlFor, timelineThumbnailWidth } from '../timeline-thumbnail-presentation';
import { retainShapePreviewCache, shapePreviewCache, shapePreviewSignature } from '../shape-preview-cache';
import { renderShapeTimelinePreview } from '../shape-timeline-preview';
import type { TimelineClipProps } from '../timeline-clip-types';
import type { TimelineArtworkImageLease } from '../timeline-artwork-images-types';
import type { TimelineCanvasArtwork, TimelineCanvasFrame } from '../timeline-canvas-types';

/** Mounted visible items own subscriptions; the lane owns decoded artwork and GPU paint. */
export function useTimelineCanvasArtwork(props: TimelineClipProps) {
  const registry = inject(timelineCanvasRegistryKey);
  if (!registry) throw new Error('Timeline canvas artwork owner unavailable.');
  const leases = new Map<string, TimelineArtworkImageLease>();
  const ready = new Map<string, HTMLImageElement>();
  const revision = ref(0),
    shapeUrl = ref(''),
    error = ref('');
  let needed = new Set<string>();
  let disposed = false,
    shapeGeneration = 0;
  let previousArtwork: TimelineCanvasArtwork | null = null;
  const releaseShapes = retainShapePreviewCache();
  const asset = computed(() => (props.clip.kind !== 'audio' && props.asset?.kind === 'video' ? props.asset : null));
  const { thumbnails, widths, error: thumbnailError, requestVisibleFrames } = useThumbnails(asset);
  const slots = computed(() =>
    props.thumbnailSlots.flatMap((slot) => {
      if (!asset.value) return [];
      const start = Math.max(slot.timelineSeconds * 1000, props.clip.timelineStartMs);
      const end = Math.min(
        (slot.timelineSeconds + slot.durationSeconds) * 1000,
        props.clip.timelineStartMs + props.clip.timelineDurationMs,
      );
      const source = sourceTimeAt(props.clip, start);
      return end > start && source !== null
        ? [
            {
              timelineSecond: slot.timelineSeconds,
              mediaSecond: Math.round(source) / 1000,
              relativeMs: start - props.clip.timelineStartMs,
              durationMs: end - start,
            },
          ]
        : [];
    }),
  );
  const frozen = ref(slots.value);
  const requestedWidth = computed(() =>
    timelineThumbnailWidth(slots.value, props.timelineWidthPx, props.duration, window.devicePixelRatio || 1),
  );
  watch(
    [slots, requestedWidth, () => props.deferThumbnailRequests],
    () => {
      if (props.deferThumbnailRequests) return;
      frozen.value = slots.value;
      requestVisibleFrames([...new Set(slots.value.map((frame) => frame.mediaSecond))], requestedWidth.value);
    },
    { immediate: true },
  );
  const shapeSignature = computed(() =>
    props.clip.kind === 'shape' ? shapePreviewSignature(props.clip, props.canvas ?? DEFAULT_OUTPUT_CANVAS) : '',
  );
  watch(
    shapeSignature,
    async (signature) => {
      const generation = ++shapeGeneration;
      if (!signature || props.clip.kind !== 'shape') {
        shapeUrl.value = '';
        return;
      }
      const clip = props.clip,
        canvas = props.canvas ?? DEFAULT_OUTPUT_CANVAS;
      try {
        const url = await shapePreviewCache.get(signature, async (current) => {
          await loadElementFonts([clip]);
          if (!current()) throw new Error('Element artwork cancelled.');
          return renderShapeTimelinePreview(clip, canvas);
        });
        if (!disposed && generation === shapeGeneration) {
          shapeUrl.value = url;
          error.value = '';
        }
      } catch (cause) {
        if (!disposed && generation === shapeGeneration) error.value = String(cause);
      }
    },
    { immediate: true },
  );
  const urls = computed(() =>
    asset.value
      ? frozen.value
          .map((frame) => thumbnailUrlFor(frame.mediaSecond, thumbnails.value))
          .filter((url): url is string => !!url)
      : props.asset?.kind === 'image'
        ? [props.asset.src]
        : shapeUrl.value
          ? [shapeUrl.value]
          : [],
  );
  const releaseUnused = () => {
    const presented = new Set(
      [previousArtwork?.source, ...(previousArtwork?.frames?.map((frame) => frame.source) ?? [])].filter(Boolean),
    );
    for (const [url, lease] of leases)
      if (!needed.has(url) && !presented.has(ready.get(url))) {
        lease.release();
        leases.delete(url);
        ready.delete(url);
      }
  };
  watch(
    urls,
    (values) => {
      needed = new Set(values);
      releaseUnused();
      for (const url of needed)
        if (!leases.has(url)) {
          const lease = registry.images.acquire(url);
          leases.set(url, lease);
          void lease.ready.then(
            (image) => {
              if (!disposed && leases.get(url) === lease) {
                ready.set(url, image);
                error.value = '';
                revision.value++;
              }
            },
            (cause) => {
              if (!disposed && leases.get(url) === lease) {
                error.value = String(cause);
                revision.value++;
              }
            },
          );
        }
    },
    { immediate: true },
  );
  watch(
    () => {
      void revision.value;
      let value: TimelineCanvasArtwork | null = null;
      if (props.clip.kind === 'color') value = { kind: 'color', fill: props.clip.fill };
      else if (asset.value) {
        const frames: TimelineCanvasFrame[] = frozen.value.map((frame) => ({
          ...frame,
          source:
            ready.get(thumbnailUrlFor(frame.mediaSecond, thumbnails.value) ?? '') ??
            previousArtwork?.frames?.find((previous) => previous.mediaSecond === frame.mediaSecond)?.source,
          pending: thumbnailIsPending(frame.mediaSecond, thumbnails.value, widths.value, requestedWidth.value),
        }));
        value = { kind: 'thumbnails', frames, error: error.value || thumbnailError?.value || '' };
      } else if (props.asset?.kind === 'image')
        value = {
          kind: 'image',
          source: ready.get(props.asset.src),
          error: error.value,
          loading: !ready.has(props.asset.src),
        };
      else if (props.clip.kind === 'shape')
        value = {
          kind: 'shape',
          source: ready.get(shapeUrl.value),
          error: error.value,
          loading: !ready.has(shapeUrl.value),
        };
      return { id: props.clip.id, value };
    },
    ({ id, value }, previous) => {
      previousArtwork = value;
      if (previous && previous.id !== id) registry.delete(previous.id);
      if (value) registry.set(id, value);
      else registry.delete(id);
      releaseUnused();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    shapeGeneration++;
    registry.delete(props.clip.id);
    for (const lease of leases.values()) lease.release();
    leases.clear();
    ready.clear();
    releaseShapes();
  });
  return { error: computed(() => error.value || thumbnailError?.value || '') };
}
