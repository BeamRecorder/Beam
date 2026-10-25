import { computed, ref } from 'vue';
import type { ClipComposition, VisualClip } from '@beam/engine/shared/composition-types';
import { createCompositionScreenResolver } from '@beam/engine/composition/scene-layers';
import { screenCursorPresentation, setScreenCursorSettings } from '@beam/engine/capture/screen-cursor-settings';
import { setScreenCursorVisibility } from '@beam/engine/capture/screen-cursor';
import { selectionHasLocks } from '@beam/engine/composition/timeline-locks';
import type { CursorPropertyScope, RecordingCursorPropertyOptions } from '../properties/cursor/cursor-property-types';
import { useTrackPropertyFeedback } from './useTrackPropertyFeedback';

export function useRecordingCursorProperties(options: RecordingCursorPropertyOptions): CursorPropertyScope {
  const tracks = ref(new Set<string>());
  const feedback = useTrackPropertyFeedback();
  const screenAt = computed(() => createCompositionScreenResolver(options.composition.value));
  const targets = computed(() => {
    const ids = [options.selectedId.value, ...options.selectedIds.value];
    const byId = new Map(
      options.composition.value.clips
        .filter((clip): clip is VisualClip => clip.kind === 'screen')
        .map((clip) => [clip.id, clip]),
    );
    const selected = [...new Set(ids)].flatMap((id) => (id && byId.has(id) ? [byId.get(id)!] : []));
    if (selected.length) return selected;
    const screen = screenAt.value(options.time.value * 1000);
    return screen ? [screen] : [];
  });
  const source = computed(() => targets.value[0]);
  const peers = computed(() =>
    source.value?.trackId
      ? options.composition.value.clips.filter(
          (clip): clip is VisualClip => clip.kind === 'screen' && clip.trackId === source.value!.trackId,
        )
      : [],
  );
  const disabled = computed(
    () =>
      !targets.value.length ||
      selectionHasLocks(options.composition.value, [], {
        clipIds: targets.value.map((clip) => clip.id),
        zoomIds: [],
      }),
  );
  const settings = computed(() => screenCursorPresentation(source.value, options.defaults.value));
  const editableTargets = (next: ClipComposition) => {
    const ids = new Set(targets.value.map((clip) => clip.id));
    const enabledTracks = new Set(
      targets.value.flatMap((clip) => (clip.trackId && tracks.value.has(clip.trackId) ? [clip.trackId] : [])),
    );
    return next.clips.filter(
      (clip): clip is VisualClip =>
        clip.kind === 'screen' &&
        (ids.has(clip.id) || Boolean(clip.trackId && enabledTracks.has(clip.trackId))) &&
        !selectionHasLocks(next, [], { clipIds: [clip.id], zoomIds: [] }),
    );
  };
  const announce = (next: ClipComposition, force = false) => {
    const clip = source.value;
    if (!clip?.trackId || !tracks.value.has(clip.trackId)) return;
    feedback.announce(
      editableTargets(next).map((clip) => ({ id: clip.id, startMs: clip.timelineStartMs })),
      clip.id,
      force,
    );
  };
  const update: CursorPropertyScope['update'] = (value) => {
    if (disabled.value) return;
    const { enabled: _, ...style } = value;
    const before = options.composition.value;
    const next = setScreenCursorSettings(
      before,
      editableTargets(before).map((clip) => clip.id),
      style,
    );
    options.composition.value = next;
    if (next !== before) announce(next);
  };
  const synchronizeVisibility = (next: ClipComposition) => {
    const clip = source.value;
    if (!clip || !clip.trackId || !tracks.value.has(clip.trackId) || disabled.value) return next;
    const replacement = next.clips.find((entry) => entry.id === clip.id);
    const visibility = screenCursorPresentation(replacement, options.defaults.value).enabled;
    const result = setScreenCursorVisibility(
      next,
      editableTargets(next).map((clip) => clip.id),
      visibility,
    );
    if (result !== next) announce(result);
    return result;
  };
  const enabled = computed({
    get: () => Boolean(source.value?.trackId && tracks.value.has(source.value.trackId)),
    set: (value: boolean) => {
      const id = source.value?.trackId;
      if (!id || (value && (disabled.value || peers.value.length < 2))) return;
      if (!value) {
        const next = new Set(tracks.value);
        next.delete(id);
        tracks.value = next;
        return;
      }
      const { enabled: visibility, ...style } = settings.value;
      const ids = peers.value
        .filter((clip) => !selectionHasLocks(options.composition.value, [], { clipIds: [clip.id], zoomIds: [] }))
        .map((clip) => clip.id);
      const styled = setScreenCursorSettings(options.composition.value, ids, style);
      const next = setScreenCursorVisibility(styled, ids, visibility);
      options.composition.value = next;
      tracks.value = new Set([...tracks.value, id]);
      announce(options.composition.value, true);
    },
  });
  return {
    available: computed(() => peers.value.length > 1),
    disabled,
    enabled,
    enabledTracks: computed(() => [...tracks.value]),
    restore: (trackIds) => {
      tracks.value = new Set(trackIds);
      feedback.reset();
    },
    feedback: feedback.feedback,
    settings,
    hasTargets: computed(() => targets.value.length > 0),
    update,
    synchronizeVisibility,
    reset: () => {
      tracks.value = new Set();
      feedback.reset();
    },
  };
}
