import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import {
  trackPropertyComposition,
  trackPropertyCameraComposition,
} from '@beam/engine/composition/clip-track-properties.test-support';
import { setCrop, createComposition, splitClip } from '@beam/engine/commands/clip-engine';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import { useSelectedClips } from '../useSelectedClips';
import { useClipTrackProperties } from '../useClipTrackProperties';
import { useScreenCursorVisibility } from '../useScreenCursorVisibility';

const effects: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  for (const scope of effects.splice(0)) scope.stop();
  vi.useRealTimers();
});
function harness() {
  const composition = shallowRef(trackPropertyComposition());
  const scope = effectScope();
  effects.push(scope);
  const selection = scope.run(() => useSelectedClips({ composition, activeTab: ref('clip') }))!;
  selection.selectClip('first');
  return {
    composition,
    selection,
    scope: selection.clipTrackProperties,
    clip: (id: string) => composition.value.clips.find((clip) => clip.id === id) as VisualClip,
  };
}

describe('track property editing scope', () => {
  it('starts independently and immediately harmonizes the lane when checked', () => {
    const h = harness();
    h.selection.updateSelectedCrop({ x: 0.1, y: 0, width: 0.9, height: 1 });
    expect(h.clip('second').crop).toBeUndefined();
    expect(h.scope.enabled.value).toBe(false);
    expect(h.scope.available.value).toBe(true);
    h.scope.enabled.value = true;
    expect(h.clip('second').crop).toEqual(h.clip('first').crop);
    expect(h.clip('third').crop).toEqual(h.clip('first').crop);
    expect(h.clip('other').crop).toBeUndefined();
    expect(h.selection.selectedClipIds.value).toEqual(['first']);
  });
  it('propagates visual updates with one composition publication, and stops when unchecked', () => {
    const h = harness();
    h.scope.enabled.value = true;
    const before = h.composition.value;
    h.selection.updateSelectedAppearance({ shadowSize: 'lg', cornerRadius: 'lg' });
    expect(h.composition.value).not.toBe(before);
    expect(h.clip('third').appearance.shadowSize).toBe('lg');
    h.selection.selectClip('second');
    expect(h.scope.enabled.value).toBe(true);
    h.selection.updateSelectedMirroredY(true);
    expect(h.clip('first').isMirroredY).toBe(true);
    h.scope.enabled.value = false;
    h.selection.updateSelectedRotation(15);
    expect(h.clip('second').rotation).toBe(15);
    expect(h.clip('first').rotation).toBeUndefined();
  });
  it('keeps speed, enabled state and deletion restricted to the explicit selection', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.selection.updateSelectedRate(2);
    expect(h.clip('first').playbackRate).toBe(2);
    expect(h.clip('second').playbackRate).toBe(1);
    h.selection.updateSelectedEnabled(false);
    expect(h.clip('second').enabled).toBe(true);
    h.selection.deleteSelectedClip();
    expect(h.composition.value.clips.map((clip) => clip.id)).toContain('second');
  });
  it('keeps per-track choices, while ordinary multi-selection continues working', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.selection.selectClip('other');
    expect(h.scope.enabled.value).toBe(false);
    expect(h.scope.available.value).toBe(false);
    h.scope.enabled.value = true;
    expect(h.scope.enabled.value).toBe(false);
    h.selection.selectClips(['other', 'second'], 'second');
    h.selection.updateSelectedMirrored(true);
    expect(['first', 'second', 'third', 'other'].every((id) => h.clip(id).isMirrored)).toBe(true);
    expect(h.selection.selectedClipIds.value).toEqual(['other', 'second']);
  });
  it('uses the primary clip as the source of a multi-selection', () => {
    const h = harness();
    h.composition.value = setCrop(h.composition.value, 'second', { x: 0.2, y: 0, width: 0.8, height: 1 });
    h.selection.selectClips(['first', 'second'], 'second');
    h.scope.enabled.value = true;
    expect(h.clip('first').crop).toEqual(h.clip('second').crop);
    const next = setCrop(h.composition.value, 'second', { x: 0.1, y: 0, width: 0.9, height: 1 });
    h.composition.value = h.scope.synchronize(next);
    expect(h.clip('third').crop).toEqual(h.clip('second').crop);
  });
  it('ignores locked siblings and prevents enabling from a locked selection', () => {
    const h = harness();
    h.clip('third').locked = true;
    h.scope.enabled.value = true;
    h.selection.updateSelectedMirrored(true);
    expect(h.clip('second').isMirrored).toBe(true);
    expect(h.clip('third').isMirrored).toBe(false);
    expect(h.scope.feedback.value?.clips.map((clip) => clip.id)).not.toContain('third');
    h.selection.selectClip('third');
    expect(h.scope.disabled.value).toBe(true);
    h.scope.enabled.value = false;
    h.scope.enabled.value = true;
    expect(h.scope.enabled.value).toBe(false);
  });
  it('follows new split fragments, and reset clears the project-local mode and feedback', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.composition.value = splitClip(h.composition.value, 'second', 3500);
    h.selection.updateSelectedRotation(10);
    expect(
      h.composition.value.clips
        .filter((clip) => clip.trackId === 'recording-track')
        .every((clip) => (clip as VisualClip).rotation === 10),
    ).toBe(true);
    h.scope.reset();
    expect(h.scope.enabled.value).toBe(false);
    expect(h.scope.feedback.value).toBeNull();
    h.selection.updateSelectedRotation(20);
    expect(h.clip('second').rotation).toBe(10);
  });
  it('applies placement, mirroring and framing to siblings without changing their selection', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.selection.updateSelectedTransform({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    h.selection.updateSelectedMirrored(true);
    h.selection.updateSelectedCameraLayout('floating-center');
    h.selection.updateSelectedCameraFraming('circle');
    expect(h.clip('third')).toMatchObject({
      transform: h.clip('first').transform,
      isMirrored: true,
      cameraLayoutPreset: 'floating-center',
      cameraFramingPreset: 'circle',
    });
    h.selection.updateSelectedTransforms([{ id: 'first', transform: { x: 0, y: 0, width: 1, height: 1 } }]);
    expect(h.clip('third').transform).toEqual(h.clip('first').transform);
  });
  it('keeps webcam layout, ratio, padding, framing and screen partners consistent across the lane', () => {
    const h = harness();
    h.composition.value = trackPropertyCameraComposition();
    h.selection.selectClip('camera-first');
    expect(h.selection.selectedWebcamClip.value?.id).toBe('camera-first');
    expect(h.selection.selectedCaptionClip.value).toBeNull();
    h.selection.updateSelectedCameraLayout('split-left');
    h.scope.enabled.value = true;
    h.selection.updateSelectedCameraSplitRatio(0.3);
    h.selection.updateSelectedCameraSplitPadding(0.04);
    h.selection.updateSelectedWebcamReactToZoom(false);
    expect(h.clip('camera-third')).toMatchObject({
      cameraSplitRatio: 0.3,
      cameraSplitPadding: 0.04,
      reactToZoom: false,
    });
    expect(h.selection.selectedClipInfo.value).toMatchObject({
      cameraLayoutPreset: 'split-left',
      cameraSplitRatio: 0.3,
      cameraSplitPadding: 0.04,
      reactToZoom: false,
      hasLinkedScreen: true,
    });
    expect(h.clip('third').transform).toEqual(h.clip('first').transform);
  });
  it('represents legacy webcam defaults before normalizing and editing their track', () => {
    const h = harness();
    const first = { ...h.clip('first'), kind: 'webcam' as const };
    delete first.cameraLayoutPreset;
    delete first.cameraFramingPreset;
    h.composition.value = { ...h.composition.value, clips: [first] };
    expect(h.selection.selectedClipInfo.value).toMatchObject({
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
      cameraSplitRatio: 0.5,
      cameraSplitPadding: 0,
      reactToZoom: true,
      hasLinkedScreen: false,
    });
    h.composition.value = createComposition(h.composition.value.assets, h.composition.value.clips);
    expect(h.selection.selectedClipInfo.value?.reactToZoom).toBe(true);
  });
  it('keeps clip appearance scope independent from cursor visibility', () => {
    const h = harness();
    h.scope.enabled.value = true;
    const defaultEnabled = ref(true);
    const cursor = useScreenCursorVisibility(
      h.composition,
      h.selection.selectedClipIds,
      ref(0),
      defaultEnabled,
      h.scope.synchronize,
    );
    cursor.enabled.value = false;
    expect(h.clip('first').showCursor).toBe(false);
    expect(h.clip('second').showCursor).toBeUndefined();
    expect(h.clip('third').showCursor).toBeUndefined();
    expect(h.clip('other').showCursor).toBeUndefined();
    expect(defaultEnabled.value).toBe(true);
  });
  it('is unavailable for empty or missing primary selections', () => {
    const h = harness();
    h.selection.selectClips([]);
    h.scope.enabled.value = true;
    h.scope.enabled.value = false;
    expect(h.scope.available.value).toBe(false);
    expect(h.scope.feedback.value).toBeNull();
    const scope = useClipTrackProperties(h.composition, ref('missing'), ref([]));
    scope.enabled.value = true;
    expect(scope.enabled.value).toBe(false);
  });
});

describe('application wave feedback', () => {
  it('starts at the chosen clip and spreads toward its neighboring fragments', () => {
    const h = harness();
    h.selection.selectClip('second');
    h.scope.enabled.value = true;
    expect(h.scope.feedback.value?.clips).toEqual([
      { id: 'first', delayMs: 75 },
      { id: 'second', delayMs: 0 },
      { id: 'third', delayMs: 75 },
    ]);
  });
  it('does not restart the shimmer on every slider tick, but confirms a later edit', () => {
    vi.useFakeTimers();
    const h = harness();
    h.scope.enabled.value = true;
    const first = h.scope.feedback.value;
    h.selection.updateSelectedRotation(10);
    expect(h.scope.feedback.value).toBe(first);
    vi.advanceTimersByTime(700);
    h.selection.updateSelectedRotation(20);
    expect(h.scope.feedback.value?.revision).toBe(first!.revision + 1);
    const current = h.scope.feedback.value;
    h.composition.value = h.scope.synchronize(h.composition.value);
    expect(h.scope.feedback.value).toBe(current);
  });
  it('does not manufacture feedback while a track has no affected siblings', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.selection.selectClip('other');
    const previous = h.scope.feedback.value;
    h.selection.updateSelectedRotation(30);
    expect(h.scope.feedback.value).toBe(previous);
    h.scope.reset();
    expect(h.scope.synchronize(h.composition.value)).toBe(h.composition.value);
  });
  it('confirms each enabled track when editing multiple tracks together', () => {
    const h = harness();
    h.scope.enabled.value = true;
    const other = h.clip('other');
    h.composition.value = {
      ...h.composition.value,
      clips: [...h.composition.value.clips, { ...other, id: 'other-2', timelineStartMs: 2500 }],
    };
    h.selection.selectClip('other');
    h.scope.enabled.value = true;
    h.selection.selectClips(['first', 'other']);
    h.selection.updateSelectedRotation(12);
    expect(h.clip('other-2').rotation).toBe(12);
    expect(h.clip('third').rotation).toBe(12);
    expect(h.scope.feedback.value?.clips.map((clip) => clip.id)).toEqual([
      'first',
      'second',
      'third',
      'other',
      'other-2',
    ]);
  });
  it('caps the delay on long tracks and excludes locked clips from the visual wave', () => {
    const h = harness();
    h.composition.value = {
      ...h.composition.value,
      clips: Array.from({ length: 20 }, (_, index) => ({
        ...h.clip('first'),
        id: `clip-${index}`,
        timelineStartMs: index * 2500,
        locked: index === 3,
      })),
    };
    h.selection.selectClip('clip-0');
    h.scope.enabled.value = true;
    expect(h.scope.feedback.value?.clips.at(-1)?.delayMs).toBe(360);
    expect(h.scope.feedback.value?.clips.some((clip) => clip.id === 'clip-3')).toBe(false);
  });
});
