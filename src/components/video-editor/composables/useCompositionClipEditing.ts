import {
  isVisualClip,
  isCompositingClip,
  isTextCaptionClip,
  clipEndMs as endMs,
} from '~/media/shared/composition-types';
import {
  clipTrimBounds,
  trimClip,
  moveClip,
  splitClip,
  holdClipAtPlayhead,
  reorderClip,
  reorderTextCaption,
  setClipEnabled,
} from '../composition/engine/clip-engine';
import { selectionHasLocks } from '../composition/timeline-locks';
import type { CompositionClipEditingOptions } from './composition-clip-editing-types';
export function useCompositionClipEditing({
  composition,
  selectedClip,
  selectedClipId,
  currentTimeSec,
}: CompositionClipEditingOptions) {
  const previewClipEdge = (clipId: string, edge: 'start' | 'end', timeMs: number) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || selectionHasLocks(composition.value, [], { clipIds: [clip.id], zoomIds: [] })) return;
    const bounds = clipTrimBounds(composition.value, clipId, edge);
    const clamped = Math.max(bounds.minMs, Math.min(bounds.maxMs, Math.round(timeMs)));
    composition.value = trimClip(composition.value, clipId, edge, clamped);
  };

  const trimClipEdge = (clipId: string, edge: 'start' | 'end', timeMs: number) => previewClipEdge(clipId, edge, timeMs);
  const previewMoveClip = (clipId: string, startMs: number) => {
    composition.value = moveClip(composition.value, clipId, startMs);
  };
  const moveClipTo = (clipId: string, startMs: number) => previewMoveClip(clipId, startMs);
  const splitSelectedClip = () => {
    const clip = selectedClip.value;
    const timeMs = Math.round(currentTimeSec.value * 1_000);
    if (!clip || clip.locked || timeMs <= clip.timelineStartMs || timeMs >= endMs(clip)) return;
    composition.value = splitClip(composition.value, clip.id, timeMs);
  };
  const holdClip = (clipId: string, timeMs: number) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || selectionHasLocks(composition.value, [], { clipIds: [clip.id], zoomIds: [] })) return;
    composition.value = holdClipAtPlayhead(composition.value, clipId, timeMs);
    const hold = composition.value.clips.find(
      (entry) =>
        isVisualClip(entry) &&
        entry.trackId === clip.trackId &&
        entry.timelineStartMs === Math.round(timeMs) &&
        entry.freezeFrameSourceMs !== undefined,
    );
    if (hold) selectedClipId.value = hold.id;
  };
  const reorderVisualClip = (clipId: string, targetIndex: number) => {
    if (!Number.isInteger(targetIndex)) return;
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || !isCompositingClip(clip)) return;
    composition.value = reorderClip(composition.value, clipId, targetIndex);
  };
  const reorderCaptionClip = (clipId: string, targetIndex: number) => {
    if (!Number.isInteger(targetIndex)) return;
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || !isTextCaptionClip(clip)) return;
    composition.value = reorderTextCaption(composition.value, clipId, targetIndex);
  };

  const toggleClip = (clipId: string) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || selectionHasLocks(composition.value, [], { clipIds: [clip.id], zoomIds: [] })) return;
    selectedClipId.value = clipId;
    composition.value = setClipEnabled(composition.value, clipId, !clip.enabled);
  };
  return {
    previewClipEdge,
    trimClipEdge,
    previewMoveClip,
    moveClipTo,
    splitSelectedClip,
    holdClip,
    reorderVisualClip,
    reorderCaptionClip,
    toggleClip,
  };
}
