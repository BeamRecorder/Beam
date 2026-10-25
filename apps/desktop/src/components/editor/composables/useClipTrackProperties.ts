import { computed, ref, shallowRef, type Ref } from 'vue';
import { applyClipTrackProperties, clipTrackPropertyTargets } from '@beam/engine/composition/clip-track-properties';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import { selectionHasLocks } from '@beam/engine/composition/timeline-locks';
import type { ClipTrackPropertyFeedback, ClipTrackPropertyScope } from '../properties/clip/clip-track-property-types';

export function useClipTrackProperties(
  composition: Ref<ClipComposition>,
  selectedId: Ref<string | null>,
  selectedIds: Ref<string[]>,
): ClipTrackPropertyScope {
  const tracks = ref(new Set<string>());
  const feedback = shallowRef<ClipTrackPropertyFeedback | null>(null);
  let revision = 0;
  let lastFeedbackAt = -Infinity;
  const wave = (next: ClipComposition, id: string) => {
    const clips = clipTrackPropertyTargets(next, id).sort(
      (a, b) => a.timelineStartMs - b.timelineStartMs || a.id.localeCompare(b.id),
    );
    const origin = clips.findIndex((clip) => clip.id === id);
    return clips.flatMap((clip, index) =>
      selectionHasLocks(next, [], { clipIds: [clip.id], zoomIds: [] })
        ? []
        : [{ id: clip.id, delayMs: Math.min(360, Math.abs(index - origin) * 75) }],
    );
  };
  const announce = (clips: ClipTrackPropertyFeedback['clips'], force = false) => {
    if (!clips.length) return;
    const now = Date.now();
    // A slider gesture produces one visible sweep, rather than restarting it on every frame.
    if (!force && now - lastFeedbackAt < 650 && JSON.stringify(clips) === JSON.stringify(feedback.value?.clips)) return;
    lastFeedbackAt = now;
    feedback.value = { revision: ++revision, clips };
  };
  const targets = computed(() =>
    selectedId.value ? clipTrackPropertyTargets(composition.value, selectedId.value) : [],
  );
  const trackId = computed(() => targets.value[0]?.trackId);
  const available = computed(() => targets.value.length > 1);
  const disabled = computed(
    () =>
      !available.value ||
      selectionHasLocks(composition.value, [], {
        clipIds: selectedId.value ? [selectedId.value, ...selectedIds.value] : selectedIds.value,
        zoomIds: [],
      }),
  );
  const synchronize = (next: ClipComposition): ClipComposition => {
    const sources = new Map<string, string>();
    // Primary selection wins when several selected fragments belong to one lane.
    for (const id of [selectedId.value, ...selectedIds.value]) {
      const clip = next.clips.find((entry) => entry.id === id);
      if (clip?.trackId && tracks.value.has(clip.trackId) && !sources.has(clip.trackId)) {
        sources.set(clip.trackId, clip.id);
      }
    }
    const affected: ClipTrackPropertyFeedback['clips'][number][] = [];
    for (const id of sources.values()) {
      const before = next;
      next = applyClipTrackProperties(next, id);
      if (next !== before) affected.push(...wave(next, id));
    }
    announce(affected);
    return next;
  };
  const enabled = computed({
    get: () => Boolean(trackId.value && tracks.value.has(trackId.value)),
    set: (value: boolean) => {
      const id = trackId.value;
      if (!id || (value && disabled.value)) return;
      if (value) {
        composition.value = applyClipTrackProperties(composition.value, selectedId.value!);
        tracks.value = new Set([...tracks.value, id]);
        announce(wave(composition.value, selectedId.value!), true);
      } else {
        const next = new Set(tracks.value);
        next.delete(id);
        tracks.value = next;
      }
    },
  });
  return {
    available,
    disabled,
    enabled,
    enabledTracks: computed(() => [...tracks.value]),
    restore: (trackIds) => {
      tracks.value = new Set(trackIds);
      feedback.value = null;
    },
    feedback,
    synchronize,
    reset: () => {
      tracks.value = new Set();
      feedback.value = null;
    },
  };
}
