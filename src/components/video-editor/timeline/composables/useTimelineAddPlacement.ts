import { computed, reactive } from 'vue';
import type { CaptionClip } from '~/media/shared/composition-types';
import type { ZoomElement } from '../../zoom/zoom-types';
import type { TimelineTracksEmits, VisualTimelineTrack } from './timeline-tracks-types';
import type { TimelineAddableVisualKind } from '../../composition/visual-element-types';
import { DEFAULT_VISUAL_ELEMENT_DURATION_MS } from '../../composition/visual-element-defaults';
import { fitZoomPlacement } from '../../zoom/zoom-placement';

type BasicTarget = 'zoom' | 'caption';
type Placement = { startMs: number; durationMs: number };
const DEFAULT_CAPTION_DURATION_MS = 2_000;

const visualKindFor = (track: VisualTimelineTrack): TimelineAddableVisualKind | null => {
  const kind = track.representative.kind;
  return kind === 'image' || kind === 'color' || kind === 'shape' || kind === 'blur' ? kind : null;
};

export function useTimelineAddPlacement(options: {
  durationMs: () => number;
  newZoomDurationMs: () => number;
  zoomElements: () => ZoomElement[];
  textCaptionClips: () => CaptionClip[];
  timeAt: (clientX: number) => number;
  emit: TimelineTracksEmits;
}) {
  const hoverPlacements = reactive<Record<string, Placement>>({});
  const targetKey = (target: BasicTarget | VisualTimelineTrack) =>
    typeof target === 'string' ? target : `visual:${target.id}`;
  const placementAt = (event: MouseEvent, target: BasicTarget | VisualTimelineTrack) => {
    const visualKind = typeof target === 'string' ? null : visualKindFor(target);
    if (typeof target !== 'string' && !visualKind) return null;
    let preferredDurationMs: number;
    if (target === 'zoom') preferredDurationMs = options.newZoomDurationMs();
    else if (target === 'caption') preferredDurationMs = DEFAULT_CAPTION_DURATION_MS;
    else {
      if (!visualKind) return null;
      preferredDurationMs = DEFAULT_VISUAL_ELEMENT_DURATION_MS[visualKind];
    }
    const occupied =
      target === 'zoom'
        ? options.zoomElements()
        : target === 'caption'
          ? options.textCaptionClips().map((clip) => ({
              startMs: clip.timelineStartMs,
              endMs: clip.timelineStartMs + clip.timelineDurationMs,
            }))
          : target.clips.map((clip) => ({
              startMs: clip.timelineStartMs,
              endMs: clip.timelineStartMs + clip.timelineDurationMs,
            }));
    const placement = fitZoomPlacement({
      anchorMs: options.timeAt(event.clientX),
      preferredDurationMs,
      timelineDurationMs: options.durationMs(),
      occupied,
    });
    return placement ? { startMs: placement.startMs, durationMs: placement.endMs - placement.startMs } : null;
  };
  const hoverAt = (event: MouseEvent, target: BasicTarget | VisualTimelineTrack) => {
    const key = targetKey(target);
    const placement = placementAt(event, target);
    if (placement) hoverPlacements[key] = placement;
    else delete hoverPlacements[key];
  };
  const leaveTrack = (target: BasicTarget | VisualTimelineTrack) => {
    delete hoverPlacements[targetKey(target)];
  };
  const addAt = (event: MouseEvent, target: BasicTarget | VisualTimelineTrack) => {
    event.preventDefault();
    event.stopPropagation();
    const placement = placementAt(event, target);
    if (!placement) return;
    if (target === 'zoom') options.emit('add:zoom', placement);
    else if (target === 'caption') options.emit('add:caption', placement);
    else {
      const kind = visualKindFor(target);
      if (kind) options.emit('add:visual-element', { ...placement, kind, trackId: target.id });
    }
  };

  return {
    hoverZoomTimeMs: computed(() => hoverPlacements.zoom?.startMs ?? null),
    hoverZoomDurationMs: computed(() => hoverPlacements.zoom?.durationMs ?? options.newZoomDurationMs()),
    hoverCaptionTimeMs: computed(() => hoverPlacements.caption?.startMs ?? null),
    hoverCaptionDurationMs: computed(() => hoverPlacements.caption?.durationMs ?? DEFAULT_CAPTION_DURATION_MS),
    hoverVisualPlacements: hoverPlacements,
    visualKindFor,
    hoverAt,
    leaveTrack,
    addAt,
  };
}
