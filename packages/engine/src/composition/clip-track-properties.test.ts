import { describe, expect, it } from 'vitest';
import { applyClipTrackProperties, clipTrackPropertyTargets } from './clip-track-properties';
import { trackPropertyComposition, trackPropertyCameraComposition } from './clip-track-properties.test-support';
import { createComposition, setAppearance, setCrop, setTransform, setCameraLayout } from '../commands/clip-engine';
import { freezeDocument } from '../document/immutable-document';
import { createDefaultCaptionStyle } from '../shared/composition-defaults';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '../shared/shape-layer-style';
import { DEFAULT_COLOR_FILL } from '../shared/color-fill-types';
import { DEFAULT_COLOR_LAYER_STYLE } from '../shared/color-layer-style';
import type { BlurClip, Clip, ColorClip, ShapeClip, VisualClip } from '../shared/composition-types';

const visual = (composition: ReturnType<typeof trackPropertyComposition>, id: string) =>
  composition.clips.find((clip) => clip.id === id) as VisualClip;
const generatedBase = (id: string, start = 0) => ({
  id,
  name: id,
  assetId: '',
  trackId: 'generated',
  timelineStartMs: start,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
});

describe('track property targets', () => {
  it('uses lane identity even across pauses, assets, sessions and clip order', () => {
    const composition = trackPropertyComposition();
    expect(clipTrackPropertyTargets(composition, 'first').map((clip) => clip.id)).toEqual(['first', 'second', 'third']);
    expect(clipTrackPropertyTargets(composition, 'second').map((clip) => clip.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
    composition.assets.push({ ...composition.assets[0]!, id: 'another-session', sessionId: 'another-session' });
    visual(composition, 'second').assetId = 'another-session';
    expect(clipTrackPropertyTargets(composition, 'third')).toHaveLength(3);
  });
  it('does not infer a lane for missing or unidentified clips', () => {
    const composition = trackPropertyComposition();
    expect(clipTrackPropertyTargets(composition, 'missing')).toEqual([]);
    delete visual(composition, 'first').trackId;
    expect(clipTrackPropertyTargets(composition, 'first')).toEqual([]);
  });
  it('keeps webcam split layouts separate from ordinary media on a mixed lane', () => {
    const composition = trackPropertyComposition();
    visual(composition, 'second').kind = 'webcam';
    visual(composition, 'third').kind = 'image';
    expect(clipTrackPropertyTargets(composition, 'first').map((clip) => clip.id)).toEqual(['first', 'third']);
    expect(clipTrackPropertyTargets(composition, 'second').map((clip) => clip.id)).toEqual(['second']);
  });
  it('does not target audio or captions', () => {
    const composition = trackPropertyComposition();
    composition.clips = [{ ...generatedBase('audio'), kind: 'audio', role: 'imported', volume: 100 }];
    expect(clipTrackPropertyTargets(composition, 'audio')).toEqual([]);
  });
});

describe('apply track properties', () => {
  it('copies crop, layout, placement, shadow, frame and mirroring in one immutable edit', () => {
    let before = trackPropertyComposition();
    before = setTransform(before, 'first', { x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    before = setCrop(before, 'first', { x: 0.2, y: 0, width: 0.6, height: 1 });
    const source = visual(before, 'first');
    source.cameraLayoutPreset = 'floating-center';
    source.isMirrored = true;
    source.isMirroredY = true;
    source.rotation = 20;
    source.showCursor = false;
    before = setAppearance(before, 'first', {
      ...source.appearance,
      shadowSize: 'lg',
      cornerRadius: 'lg',
      frame: 'safari',
    });
    freezeDocument(before);
    const after = applyClipTrackProperties(before, 'first');
    expect(after).not.toBe(before);
    expect(after.assets).toBe(before.assets);
    expect(visual(after, 'first')).toBe(visual(before, 'first'));
    for (const id of ['second', 'third']) {
      expect(visual(after, id)).toMatchObject({
        transform: visual(after, 'first').transform,
        crop: visual(after, 'first').crop,
        appearance: visual(after, 'first').appearance,
        cameraLayoutPreset: 'floating-center',
        isMirrored: true,
        isMirroredY: true,
        rotation: 20,
      });
      const original = visual(before, id);
      expect(visual(after, id)).toMatchObject({
        id,
        name: original.name,
        assetId: original.assetId,
        timelineStartMs: original.timelineStartMs,
        timelineDurationMs: original.timelineDurationMs,
        sourceInMs: original.sourceInMs,
        sourceDurationMs: original.sourceDurationMs,
        playbackRate: original.playbackRate,
        enabled: original.enabled,
      });
    }
    expect(visual(before, 'second').crop).toBeUndefined();
    expect(visual(after, 'other')).toBe(visual(before, 'other'));
  });
  it('clears optional settings when the source has reset them', () => {
    const before = trackPropertyComposition();
    Object.assign(visual(before, 'second'), {
      crop: { x: 0.1, y: 0, width: 0.9, height: 1 },
      rotation: 40,
      showCursor: false,
    });
    const after = applyClipTrackProperties(before, 'first');
    expect(visual(after, 'second').crop).toBeUndefined();
    expect(visual(after, 'second').rotation).toBeUndefined();
    expect(visual(after, 'second').showCursor).toBe(false);
    expect(applyClipTrackProperties(after, 'first')).toBe(after);
  });
  it.each(['first', 'second'])('preserves locks when %s is locked', (id) => {
    const before = trackPropertyComposition();
    visual(before, 'first').isMirrored = true;
    visual(before, id).locked = true;
    const after = applyClipTrackProperties(before, 'first');
    if (id === 'first') expect(after).toBe(before);
    else {
      expect(visual(after, 'second')).toBe(visual(before, 'second'));
      expect(visual(after, 'third').isMirrored).toBe(true);
    }
  });
  it('also protects unlocked fragments whose linked sidecar is locked', () => {
    const before = trackPropertyComposition();
    visual(before, 'first').isMirrored = true;
    visual(before, 'second').groupId = 'linked';
    visual(before, 'other').groupId = 'linked';
    visual(before, 'other').timelineStartMs = 2500;
    visual(before, 'other').locked = true;
    const after = applyClipTrackProperties(before, 'first');
    expect(visual(after, 'second')).toBe(visual(before, 'second'));
    expect(visual(after, 'third').isMirrored).toBe(true);
    expect(applyClipTrackProperties(before, 'second')).toBe(before);
  });
  it('preserves identities, source offsets, disabled state, speed, freeze frames, links and transitions', () => {
    const before = trackPropertyComposition();
    visual(before, 'first').isMirrored = true;
    const target = visual(before, 'second');
    Object.assign(target, {
      sourceInMs: 100,
      sourceDurationMs: 1000,
      timelineDurationMs: 500,
      playbackRate: 2,
      enabled: false,
      freezeFrameSourceMs: 100,
      groupId: 'own-link',
      recordingClipId: null,
      transitions: { entry: { preset: { kind: 'fade' }, durationMs: 100 }, exit: null },
    });
    const after = applyClipTrackProperties(before, 'first');
    expect(visual(after, 'second')).toMatchObject({
      ...target,
      isMirrored: true,
      appearance: visual(before, 'first').appearance,
    });
  });
  it('copies webcam split settings and adjusts each linked screen without transferring recording associations', () => {
    const before = setCameraLayout(trackPropertyCameraComposition(), 'camera-first', 'split-left');
    Object.assign(visual(before, 'camera-first'), {
      cameraSplitRatio: 0.3,
      cameraSplitPadding: 0.04,
      reactToZoom: false,
    });
    const after = applyClipTrackProperties(before, 'camera-first');
    expect(visual(after, 'camera-second')).toMatchObject({
      cameraLayoutPreset: 'split-left',
      cameraSplitRatio: 0.3,
      cameraSplitPadding: 0.04,
      reactToZoom: false,
      groupId: 'pair-second',
    });
    expect(visual(after, 'second').transform.x).toBeCloseTo(0.34);
    expect(visual(after, 'second').transform.width).toBeCloseTo(0.62);
    expect(visual(after, 'second').transform.y).toBe(0.04);
    expect(visual(after, 'second').transform.height).toBe(0.92);
    expect(visual(after, 'third').transform).toEqual(visual(after, 'second').transform);
  });
  it('restores linked screens when the source leaves a split layout', () => {
    const split = applyClipTrackProperties(
      setCameraLayout(trackPropertyCameraComposition(), 'camera-first', 'split-left'),
      'camera-first',
    );
    const before = setCameraLayout(split, 'camera-first', 'floating-bottom-right');
    const after = applyClipTrackProperties(before, 'camera-first');
    expect(visual(after, 'camera-second').cameraLayoutPreset).toBe('floating-bottom-right');
    expect(visual(after, 'second').transform).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('skips camera/screen pairs with a locked partner or an explicitly detached camera', () => {
    const before = setCameraLayout(trackPropertyCameraComposition(), 'camera-first', 'split-left');
    visual(before, 'second').locked = true;
    visual(before, 'camera-third').recordingClipId = null;
    const after = applyClipTrackProperties(before, 'camera-first');
    expect(visual(after, 'camera-second')).toBe(visual(before, 'camera-second'));
    expect(visual(after, 'second')).toBe(visual(before, 'second'));
    expect(visual(after, 'camera-third')).toBe(visual(before, 'camera-third'));
    expect(clipTrackPropertyTargets(before, 'camera-first').map((clip) => clip.id)).toEqual(['camera-first']);
  });
  it('can leave a detached split layout without trying to change a missing partner', () => {
    const split = applyClipTrackProperties(
      setCameraLayout(trackPropertyCameraComposition(), 'camera-first', 'split-left'),
      'camera-first',
    );
    const before = setCameraLayout(split, 'camera-first', 'floating-center');
    visual(before, 'camera-second').recordingClipId = null;
    const after = applyClipTrackProperties(before, 'camera-first');
    expect(visual(after, 'camera-second').cameraLayoutPreset).toBe('floating-center');
  });
  it('copies blur styling across the lane without changing another effect kind', () => {
    const source: BlurClip = {
      ...generatedBase('blur'),
      kind: 'blur',
      shape: 'circle',
      mode: 'blur',
      strength: 35,
      feather: 12,
      cornerRadius: 9,
      tintOpacity: 0.2,
      color: '#112233',
      highlightColor: '#ff0000',
    };
    const target: BlurClip = { ...source, ...generatedBase('blur-2', 1500), strength: 80, feather: 0 };
    const after = applyClipTrackProperties(createComposition([], [source, target]), 'blur');
    expect(after.clips[1]).toMatchObject({
      id: 'blur-2',
      strength: 35,
      feather: 12,
      shape: 'circle',
      highlightColor: '#ff0000',
    });
  });
  it('copies generated color settings and leaves a neighboring shape intact', () => {
    const source: ColorClip = {
      ...generatedBase('color'),
      kind: 'color',
      fill: DEFAULT_COLOR_FILL,
      ...DEFAULT_COLOR_LAYER_STYLE,
      opacity: 0.4,
      shadowSize: 'lg',
    };
    const target: ColorClip = { ...source, ...generatedBase('color-2', 1500), opacity: 1, shadowSize: 'none' };
    const shape: ShapeClip = { ...generatedBase('shape', 3000), kind: 'shape', ...DEFAULT_ANNOTATION_SHAPE_STYLE };
    const before = createComposition([], [source, target, shape]);
    const after = applyClipTrackProperties(before, 'color');
    expect(after.clips[1]).toMatchObject({ opacity: 0.4, shadowSize: 'lg' });
    expect(after.clips[2]).toBe(before.clips[2]);
  });
  it('copies shape styling without replacing text or paths on other shapes', () => {
    const source: ShapeClip = {
      ...generatedBase('shape'),
      kind: 'shape',
      ...DEFAULT_ANNOTATION_SHAPE_STYLE,
      fillColor: '#ff0000',
      rotation: 30,
      shadowEnabled: true,
    };
    const target: ShapeClip = {
      ...source,
      ...generatedBase('shape-2', 1500),
      fillColor: '#000000',
      rotation: 0,
      family: 'text',
      preset: 'text',
      vector: null,
      text: { content: 'Keep me', style: createDefaultCaptionStyle(), padding: 5, verticalAlign: 'center' },
    };
    const after = applyClipTrackProperties(createComposition([], [source, target]), 'shape');
    expect(after.clips[1]).toMatchObject({
      fillColor: '#ff0000',
      rotation: 30,
      vector: null,
      text: { content: 'Keep me' },
    });
  });
  it('shares text typography while preserving each segment’s words', () => {
    const text = {
      content: 'First words',
      style: createDefaultCaptionStyle(72),
      padding: 9,
      verticalAlign: 'top' as const,
    };
    const source: ShapeClip = {
      ...generatedBase('text'),
      kind: 'shape',
      ...DEFAULT_ANNOTATION_SHAPE_STYLE,
      family: 'text',
      preset: 'text',
      text,
    };
    const target: ShapeClip = {
      ...source,
      ...generatedBase('text-2', 1500),
      text: { ...text, content: 'Different words', style: createDefaultCaptionStyle(24), padding: 0 },
    };
    const after = applyClipTrackProperties(createComposition([], [source, target]), 'text');
    expect((after.clips[1] as ShapeClip).text).toEqual({ ...text, content: 'Different words' });
  });
  it('does not transfer text content into non-text shapes', () => {
    const source: ShapeClip = {
      ...generatedBase('text'),
      kind: 'shape',
      ...DEFAULT_ANNOTATION_SHAPE_STYLE,
      family: 'text',
      preset: 'text',
      text: { content: 'Words', style: createDefaultCaptionStyle(), padding: 4, verticalAlign: 'center' },
    };
    const target: ShapeClip = { ...generatedBase('rectangle', 1500), kind: 'shape', ...DEFAULT_ANNOTATION_SHAPE_STYLE };
    const after = applyClipTrackProperties(createComposition([], [source, target]), 'text');
    expect((after.clips[1] as ShapeClip).text).toBeUndefined();
    expect((after.clips[1] as ShapeClip).family).toBe('shape');
  });
  it('returns the original composition for missing and unsupported sources', () => {
    const before = trackPropertyComposition();
    expect(applyClipTrackProperties(before, 'missing')).toBe(before);
    const audio: Clip = {
      ...generatedBase('audio'),
      kind: 'audio',
      assetId: 'recording',
      role: 'imported',
      volume: 100,
    };
    const next = { ...before, clips: [audio] };
    expect(applyClipTrackProperties(next, 'audio')).toBe(next);
  });
  it('rejects invalid propagated data atomically', () => {
    const before = trackPropertyComposition();
    visual(before, 'first').transform = { x: NaN, y: 0, width: 1, height: 1 };
    expect(() => applyClipTrackProperties(before, 'first')).toThrow();
    expect(visual(before, 'second').transform.x).toBe(0);
  });
});
