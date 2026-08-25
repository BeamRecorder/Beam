import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS } from '../../canvas/output-canvas';
import { createDefaultCursorPresentation } from '../../../../api/types/cursor-presentation';
import type { ProjectEditorState } from '../../../../api/types/capture-api';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { COMPOSITION_SCHEMA_VERSION } from '~/media/shared/composition-types';
import type { AudioClip, BlurClip, CaptionClip, ClipComposition, VisualClip } from '~/media/shared/composition-types';
import type { EditorPreferenceDefaults } from '../editor-default-types';
import {
  applyFreshPresentationDefaults,
  audioDefaultsFor,
  blurDefaultsFor,
  captionDefaultsFor,
  defaultsFromEditorState,
  normalizeEditorPreferenceDefaults,
  visualClipDefaultProps,
  visualDefaultsFor,
} from '../editor-defaults';

const composition = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  clips: [],
  keyboardCaptionSessions: [],
});

const state = (): ProjectEditorState => ({
  schemaVersion: 3,
  isFresh: true,
  composition: composition(),
  zoom: { elements: [], generatedSessions: [] },
  presentation: {
    canvas: { ...DEFAULT_OUTPUT_CANVAS },
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: createDefaultCursorPresentation(),
  },
});

const visual = (kind: VisualClip['kind'], overrides: Partial<VisualClip> = {}): VisualClip => ({
  id: `${kind}-clip`,
  kind,
  name: kind,
  assetId: `${kind}-asset`,
  timelineStartMs: 100,
  timelineDurationMs: 1_500,
  sourceInMs: 0,
  sourceDurationMs: 1_500,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const caption = (): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_250,
  sourceInMs: 0,
  sourceDurationMs: 1_250,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.2, y: 0.7, width: 0.6, height: 0.2 },
  caption: {
    type: 'text',
    sentences: [{ id: 'sentence', text: 'Hello', startMs: 0, endMs: 1_250, words: [] }],
    style: { ...createDefaultCaptionStyle(36), color: '#ff00aa' },
  },
});

const blur = (): BlurClip => ({
  id: 'blur',
  kind: 'blur',
  name: 'Blur',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 900,
  sourceInMs: 0,
  sourceDurationMs: 900,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.3, y: 0.4, width: 0.2, height: 0.1 },
  shape: 'circle',
  mode: 'pixelated',
  strength: 72,
  feather: 9,
  cornerRadius: 18,
  tintOpacity: 0.25,
  color: '#123456',
});

const audio = (): AudioClip => ({
  id: 'audio',
  kind: 'audio',
  name: 'Audio',
  assetId: 'audio-asset',
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  volume: 135,
});

describe('editor defaults', () => {
  it('keeps the rounded caption shape for new projects without saved caption defaults', () => {
    expect(captionDefaultsFor(normalizeEditorPreferenceDefaults({})).style.shape).toEqual(
      createDefaultCaptionStyle().shape,
    );
  });

  it('normalizes malformed values safely and bounds visual defaults', () => {
    expect(normalizeEditorPreferenceDefaults(null)).toEqual({ schemaVersion: 1 });

    const normalized = normalizeEditorPreferenceDefaults({
      zoomMotionBlur: { enabled: false, intensity: 2 },
      visual: {
        video: {
          transform: { x: Number.NaN, y: 'bad', width: -1, height: 0 },
          appearance: { cornerRadius: 'lg' },
          playbackRate: 99,
          cameraLayoutPreset: 'split-left',
          cameraFramingPreset: 'portrait',
          isMirrored: true,
        },
        webcam: {
          playbackRate: -2,
          cameraLayoutPreset: 'split-right',
          cameraFramingPreset: 'invalid',
          cameraSplitRatio: 9,
          cameraSplitPadding: -1,
        },
      },
    });

    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.zoomMotionBlur).toEqual({ enabled: false, intensity: 1 });
    expect(normalized.visual?.video).toMatchObject({
      transform: { x: 0, y: 0, width: 1, height: 1 },
      playbackRate: 4,
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'portrait',
      isMirrored: true,
      isMirroredY: false,
      appearance: { cornerRadius: 'lg', shadowSize: 'md' },
    });
    expect(normalized.visual?.webcam).toMatchObject({
      transform: { x: 0.72, y: 0.72, width: 0.24, height: 0.24 },
      playbackRate: 0.25,
      cameraLayoutPreset: 'split-right',
      cameraFramingPreset: 'custom',
      cameraSplitRatio: 0.8,
      cameraSplitPadding: 0,
    });
  });

  it('captures normalized zoom motion blur from the editor state without sharing values', () => {
    const editorState = state();
    editorState.zoom.motionBlur = { enabled: false, intensity: 0.77 };

    const result = defaultsFromEditorState(normalizeEditorPreferenceDefaults(undefined), editorState, null, null);

    expect(result.zoomMotionBlur).toEqual({ enabled: false, intensity: 0.77 });
    result.zoomMotionBlur!.intensity = 0.2;
    expect(editorState.zoom.motionBlur?.intensity).toBe(0.77);
  });

  it('migrates legacy caption backdrop blur into a square shape and keeps it for new captions', () => {
    const normalized = normalizeEditorPreferenceDefaults({
      caption: {
        style: { fontSize: 36, backdropBlur: 24, customText: 'legacy caption' },
        durationMs: 1_000,
      },
    });

    expect(normalized.caption?.style.shape).toEqual({
      preset: 'square',
      radius: 35,
      color: '#000000',
      opacity: 0,
      blur: 24,
      padding: 0,
    });
    expect(normalized.caption?.style).not.toHaveProperty('backdropBlur');

    expect(captionDefaultsFor(normalized, 30).style.shape).toEqual(normalized.caption?.style.shape);
  });

  it('normalizes and preserves grouped caption shape values when creating caption defaults', () => {
    const normalized = normalizeEditorPreferenceDefaults({
      caption: {
        style: {
          ...createDefaultCaptionStyle(42),
          shape: {
            preset: 'pill',
            radius: 140,
            color: '#123456',
            opacity: 125,
            blur: -8,
          },
        },
        durationMs: 1_000,
      },
    });

    const expectedShape = {
      preset: 'pill',
      radius: 100,
      color: '#123456',
      opacity: 100,
      blur: 0,
      padding: 30,
    } as const;

    expect(normalized.caption?.style.shape).toEqual(expectedShape);
    expect(captionDefaultsFor(normalized).style.shape).toEqual(expectedShape);
  });

  it('extracts presentation and the selected visual or zoom defaults without sharing mutable values', () => {
    const current = normalizeEditorPreferenceDefaults({ visual: { video: { playbackRate: 2 } } });
    const editorState = state();
    editorState.presentation.selectedBackgroundId = 'saved-background';
    editorState.presentation.canvas.transitions = {
      entry: { preset: { kind: 'fade' }, durationMs: 650 },
      exit: null,
    };
    const selected = visual('webcam', {
      cameraLayoutPreset: 'split-left',
      cameraFramingPreset: 'circle',
      cameraSplitRatio: 0.65,
      cameraSplitPadding: 0.03,
    });
    const result = defaultsFromEditorState(current, editorState, selected, {
      id: 'zoom',
      sessionId: 'session',
      startMs: 100,
      endMs: 900,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 4,
      mode: 'manual',
    });

    expect(result.presentation).toMatchObject({ selectedBackgroundId: 'saved-background' });
    expect(result.presentation).not.toHaveProperty('importedBackgrounds');
    expect(result.presentation?.canvas.transitions).toEqual({
      entry: { preset: { kind: 'fade' }, durationMs: 650 },
      exit: null,
    });
    expect(result.visual?.webcam).toMatchObject({
      transform: selected.transform,
      cameraLayoutPreset: 'split-left',
      cameraFramingPreset: 'circle',
      cameraSplitRatio: 0.65,
      cameraSplitPadding: 0.03,
    });
    expect(result.zoom).toEqual({ durationMs: 800, depth: 4, mode: 'manual' });

    result.visual!.webcam!.transform.x = 0.99;
    expect(selected.transform.x).toBe(0.1);
    result.presentation!.canvas.transitions!.entry!.durationMs = 900;
    expect(editorState.presentation.canvas.transitions?.entry?.durationMs).toBe(650);
  });

  it.each([
    ['caption', caption(), { style: caption().caption.style, transform: caption().transform, durationMs: 1_250 }],
    ['blur', blur(), { transform: blur().transform, shape: 'circle', mode: 'pixelated', strength: 72 }],
    ['audio', audio(), { volume: 135, playbackRate: 1 }],
  ] as const)('extracts selected %s defaults', (_kind, selected, expected) => {
    const result = defaultsFromEditorState(normalizeEditorPreferenceDefaults(undefined), state(), selected, null);
    if (selected.kind === 'caption') expect(result.caption).toMatchObject(expected);
    if (selected.kind === 'blur') expect(result.blur).toMatchObject(expected);
    if (selected.kind === 'audio') expect(result.audio).toEqual(expected);
  });

  it('never persists caption custom text while preserving visual caption preferences', () => {
    const normalized = normalizeEditorPreferenceDefaults({
      caption: {
        style: { ...createDefaultCaptionStyle(42), customText: 'stale caption', color: '#12ab34' },
        transform: { x: 0.1, y: 0.2, width: 0.7, height: 0.2 },
        durationMs: 1_000,
      },
    });

    expect(normalized.caption?.style).not.toHaveProperty('customText');
    expect(normalized.caption?.style.color).toBe('#12ab34');

    const selected = caption();
    selected.caption.style.customText = 'caption from the selected clip';
    selected.caption.style.color = '#abcdef';
    const extracted = defaultsFromEditorState(normalized, state(), selected, null);

    expect(extracted.caption?.style).not.toHaveProperty('customText');
    expect(extracted.caption?.style.color).toBe('#abcdef');

    const applied = captionDefaultsFor({
      ...extracted,
      caption: {
        ...extracted.caption!,
        style: { ...extracted.caption!.style, customText: 'should never become a new caption' },
      },
    } as unknown as EditorPreferenceDefaults);

    expect(applied.style).not.toHaveProperty('customText');
    expect(applied.style.color).toBe('#abcdef');
  });

  it('applies presentation defaults to a fresh state, normalizes its canvas, and clears imported backgrounds', () => {
    const editorState = state();
    editorState.presentation.importedBackgrounds = [
      { id: 'old', name: 'Old', path: '/old.png', extension: 'png', kind: 'image' },
    ];
    const defaults: EditorPreferenceDefaults = {
      schemaVersion: 1,
      presentation: {
        ...editorState.presentation,
        canvas: {
          ...DEFAULT_OUTPUT_CANVAS,
          width: 0,
          height: 0,
          showBackground: true,
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 6_000 }, exit: null },
        },
        selectedBackgroundId: 'default-background',
      },
    };
    const applied = applyFreshPresentationDefaults(editorState, defaults);

    expect(applied).not.toBe(editorState);
    expect(applied.composition).toBe(editorState.composition);
    expect(applied.zoom).toBe(editorState.zoom);
    expect(applied.presentation.selectedBackgroundId).toBe('default-background');
    expect(applied.presentation.canvas).toMatchObject({ width: 1920, height: 1080, showBackground: true });
    expect(applied.presentation.canvas.transitions).toEqual({
      entry: { preset: { kind: 'fade' }, durationMs: 5_000 },
      exit: null,
    });
    expect(applied.presentation.importedBackgrounds).toEqual([]);

    defaults.presentation!.selectedBackgroundId = 'mutated';
    expect(applied.presentation.selectedBackgroundId).toBe('default-background');
  });

  it('returns the original state when there are no presentation defaults', () => {
    const editorState = state();
    expect(applyFreshPresentationDefaults(editorState, { schemaVersion: 1 })).toBe(editorState);
  });

  it('provides visual, caption, audio and blur defaults with the expected bounds and cloning', () => {
    const defaults = normalizeEditorPreferenceDefaults({
      visual: {
        video: {
          playbackRate: 2,
          cameraFramingPreset: 'portrait',
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null },
        },
      },
      caption: {
        style: { ...createDefaultCaptionStyle(42), color: '#00ff00' },
        transform: { x: 0.1, y: 0.2, width: 0.7, height: 0.2 },
        durationMs: 50,
      },
      audio: { volume: 250, playbackRate: 0.1 },
      blur: {
        transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        shape: 'square',
        mode: 'opaque',
        strength: 90,
        feather: 4,
        cornerRadius: 12,
        tintOpacity: 0.4,
        color: '#abcdef',
      },
    });

    expect(visualDefaultsFor(defaults, 'image')).toMatchObject({
      transform: { x: 0, y: 0, width: 1, height: 1 },
      cameraLayoutPreset: 'custom',
      cameraFramingPreset: 'custom',
    });
    const visualProps = visualClipDefaultProps(defaults, 'video', 2_000);
    expect(visualProps).toMatchObject({ playbackRate: 2, cameraFramingPreset: 'portrait' });
    expect(visualProps.transitions.entry).toEqual({ preset: { kind: 'fade' }, durationMs: 500 });
    expect(visualProps.appearance).not.toBe(defaults.visual?.video?.appearance);

    expect(captionDefaultsFor(defaults, 30)).toMatchObject({
      style: { fontSize: 42, color: '#00ff00' },
      transform: { x: 0.1, y: 0.2, width: 0.7, height: 0.2 },
      durationMs: 200,
    });
    expect(audioDefaultsFor(defaults)).toEqual({ volume: 200, playbackRate: 0.25 });
    expect(blurDefaultsFor(defaults)).toMatchObject({ shape: 'square', mode: 'opaque', color: '#abcdef' });

    const blurValue = blurDefaultsFor(defaults);
    blurValue.transform.x = 0.8;
    expect(defaults.blur?.transform.x).toBe(0.1);
  });
});
