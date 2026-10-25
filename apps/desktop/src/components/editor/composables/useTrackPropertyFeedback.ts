import { shallowRef } from 'vue';
import type { TrackPropertyFeedback } from '../properties/track-property-types';

export function useTrackPropertyFeedback() {
  const feedback = shallowRef<TrackPropertyFeedback | null>(null);
  let revision = 0,
    lastAt = -Infinity;
  const announce = (items: readonly { id: string; startMs: number }[], sourceId: string, force = false) => {
    if (!items.length) return;
    const ordered = [...items].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
    const origin = ordered.findIndex((item) => item.id === sourceId);
    const clips = ordered.map((item, index) => ({
      id: item.id,
      delayMs: Math.min(360, Math.abs(index - Math.max(0, origin)) * 75),
    }));
    const now = Date.now();
    if (!force && now - lastAt < 650 && JSON.stringify(clips) === JSON.stringify(feedback.value?.clips)) return;
    lastAt = now;
    feedback.value = { revision: ++revision, clips };
  };
  return {
    feedback,
    announce,
    reset: () => {
      feedback.value = null;
    },
  };
}
