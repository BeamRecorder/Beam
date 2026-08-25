import type { MediaError } from '~/media/shared';
import type { Clip, MediaAsset } from '~/media/shared/composition-types';
import type { TimelineThumbnailSlot } from './composables/timeline-viewport';
import type { AudioWaveformStatus } from './composables/useCompositionAudioWaveforms';

export interface TimelineClipProps {
  clip: Clip;
  asset?: MediaAsset | null;
  duration: number;
  timelineWidthPx?: number;
  thumbnailSlots: readonly TimelineThumbnailSlot[];
  selected: boolean;
  waveformBars?: number[];
  waveformLeftPercent?: number;
  waveformWidthPercent?: number;
  waveformLoadingSegments?: Array<{ leftPercent: number; widthPercent: number }>;
  waveformStatus?: AudioWaveformStatus;
  waveformError?: MediaError;
  trimState?: { edge: 'start' | 'end'; durationMs: number; atLimit?: boolean } | null;
  deferThumbnailRequests?: boolean;
  deferWaveformDraw?: boolean;
  pasteHighlight?: boolean;
}
