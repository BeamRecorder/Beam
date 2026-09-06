import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { createComposition } from '../../composition/engine/clip-engine';
import type {
  AudioClip,
  ClipComposition,
  MediaAsset,
  NormalizedCrop,
  VisualClip,
} from '~/media/shared/composition-types';
import { useCropPreview } from '../useCropPreview';

const previewCrop: NormalizedCrop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };

const assetFor = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: kind === 'audio' ? `${id}.wav` : `${id}.mp4`,
  durationMs: 1_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `${id}.${kind === 'audio' ? 'wav' : 'mp4'}`,
  origin: 'project',
});

const visualClip = (id: string, assetId: string, trackId: string): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
});

const audioClip = (): AudioClip => ({
  id: 'audio',
  kind: 'audio',
  name: 'audio',
  assetId: 'audio-asset',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 2,
  role: 'imported',
  volume: 100,
});

const compositionFor = (): ClipComposition =>
  createComposition(
    [assetFor('selected-asset'), assetFor('other-asset'), assetFor('audio-asset', 'audio')],
    [
      visualClip('selected', 'selected-asset', 'selected-track'),
      visualClip('other', 'other-asset', 'other-track'),
      audioClip(),
    ],
  );

const clipAt = (composition: ClipComposition, id: string) => composition.clips.find((clip) => clip.id === id);

const setup = (selectedIds: string[] = ['selected']) => {
  const composition = ref(compositionFor());
  const selectedClipIds = ref(selectedIds);
  const state = useCropPreview({ composition, selectedClipIds });
  return { composition, selectedClipIds, state };
};

describe('useCropPreview', () => {
  it('starts empty, previews only selected visual clips, and leaves the saved composition untouched', () => {
    const { composition, state } = setup(['selected', 'audio']);
    const before = JSON.stringify(composition.value);

    expect(state.cropPreview.value).toBeNull();
    expect(state.cropCompositionPreview.value).toBeNull();

    state.previewCrop(previewCrop);

    const preview = state.cropCompositionPreview.value;
    expect(state.cropPreview.value).toEqual(previewCrop);
    expect(preview).not.toBe(composition.value);
    expect(JSON.stringify(composition.value)).toBe(before);
    expect(clipAt(composition.value, 'selected')).not.toHaveProperty('crop');
    expect(clipAt(preview!, 'selected')).toMatchObject({ crop: previewCrop, cameraFramingPreset: 'custom' });
    expect(clipAt(preview!, 'other')).toEqual(clipAt(composition.value, 'other'));
    expect(clipAt(preview!, 'audio')).toEqual(clipAt(composition.value, 'audio'));
  });

  it('replaces a draft without entering the source composition and clears synchronously on null', () => {
    const { composition, state } = setup();
    const original = JSON.stringify(composition.value);
    const replacement: NormalizedCrop = { x: 0.3, y: 0.1, width: 0.4, height: 0.8 };

    state.previewCrop(previewCrop);
    state.previewCrop(replacement);
    expect(state.cropPreview.value).toEqual(replacement);
    expect(state.cropCompositionPreview.value).toMatchObject({
      clips: expect.arrayContaining([expect.objectContaining({ id: 'selected', crop: replacement })]),
    });
    expect(JSON.stringify(composition.value)).toBe(original);

    state.previewCrop(null);
    expect(state.cropPreview.value).toBeNull();
    expect(state.cropCompositionPreview.value).toBeNull();
  });

  it('clears the draft synchronously when the composition is replaced by a history restore', () => {
    const { composition, state } = setup();
    state.previewCrop(previewCrop);
    expect(state.cropCompositionPreview.value).not.toBeNull();

    composition.value = compositionFor();

    expect(state.cropPreview.value).toBeNull();
    expect(state.cropCompositionPreview.value).toBeNull();
  });

  it('clears the draft synchronously when selection changes', () => {
    const { selectedClipIds, state } = setup();
    state.previewCrop(previewCrop);
    expect(state.cropPreview.value).toEqual(previewCrop);

    selectedClipIds.value = ['other'];

    expect(state.cropPreview.value).toBeNull();
    expect(state.cropCompositionPreview.value).toBeNull();
  });
});
