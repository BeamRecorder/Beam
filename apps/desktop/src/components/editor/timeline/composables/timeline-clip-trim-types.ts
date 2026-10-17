import type { Ref } from 'vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import type { TimelineTracksEmits, TimelineTracksProps } from './timeline-tracks-types';

export interface TimelineClipTrimOptions {
  props: TimelineTracksProps;
  emit: TimelineTracksEmits;
  tracksScrollRef: Ref<HTMLDivElement | null>;
  displayedPlayheadTime: Ref<number>;
  activeSnapTimeMs: Ref<number | null>;
  previewDurationMs: Ref<number | null>;
  clipPreview: Ref<Record<string, { startMs: number; durationMs: number }>>;
  activeTrimState: Ref<{
    ids: string[];
    edge: 'start' | 'end';
    durationMs: number;
    atLimit?: boolean;
  } | null>;
  linkedIdsFor: (clip: Clip) => string[];
  clearLinkedPreview: (ids: string[]) => void;
  resolveMsPerPx: () => {
    baseDurationMs: number;
    width: number;
    msPerPx: number;
    visualScale: number;
  };
  updateAutoScroll: (clientX: number, onScroll?: ((deltaPx: number) => void) | null) => void;
  stopAutoScroll: () => void;
}
