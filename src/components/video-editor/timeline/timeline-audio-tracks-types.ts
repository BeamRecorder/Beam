import type { AudioClip, Clip, ClipComposition, MediaAsset } from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { MediaError } from '~/media/shared';
import type { TimelineClipProps } from './timeline-clip-types';
import type { ImportedAudioTimelineTrack } from './composables/audio-timeline-tracks';
import type { AudioWaveformSlice, AudioWaveformStatus } from './composables/useCompositionAudioWaveforms';
import type { LiveAudioDraft, TimelineItemKind } from './composables/timeline-tracks-types';
import type { TimelinePasteHighlight, TimelineItemCategory } from './composables/timeline-clipboard-types';

export interface TimelineAudioLane {
  id: string;
  clips: AudioClip[];
  voiceover?: boolean;
  gaps?: boolean;
  draft?: LiveAudioDraft;
}

export interface TimelineAudioTracksProps {
  systemAudioClips: AudioClip[];
  microphoneClips: AudioClip[];
  voiceoverClips: AudioClip[];
  importedAudioTracks: ImportedAudioTimelineTrack[];
  voiceoverDraft?: LiveAudioDraft | null;
  composition: ClipComposition;
  zoomElements: readonly ZoomElement[];
  includeAudioInExport: boolean;
  layoutDurationMs: number;
  rulerLayoutWidth: number;
  thumbnailSlots: TimelineClipProps['thumbnailSlots'];
  isWheelZooming: boolean;
  isMoving: boolean;
  isTrimming: boolean;
  selectedClipIdSet: Set<string>;
  recentPaste?: TimelinePasteHighlight | null;
  audioWaveforms: Record<string, AudioWaveformSlice>;
  audioWaveformStatus: Record<string, AudioWaveformStatus>;
  audioWaveformErrors: Record<string, MediaError>;
  assetFor: (clip: Clip) => MediaAsset | null;
  displayedClip: (clip: Clip) => Clip;
  trimStateFor: (id: string) => TimelineClipProps['trimState'];
  percentageStyle: (startMs: number, durationMs: number) => Record<string, string>;
  selectItem: (kind: TimelineItemKind, id: string, event: MouseEvent) => void;
  startClipMove: (event: PointerEvent, clip: Clip) => void;
  beginClipTrim: (event: PointerEvent, clip: Clip, edge: 'start' | 'end') => void;
  openClipContextMenu: (event: MouseEvent, clip: Clip) => void;
  openTrackContextMenu: (
    event: MouseEvent,
    category: TimelineItemCategory,
    trackId?: string,
    clipIds?: string[],
  ) => void;
}
