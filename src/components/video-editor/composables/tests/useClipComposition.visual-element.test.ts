import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { CaptureProject, ProjectEditorData } from '../../../../api/types/capture-api';
import { DEFAULT_COLOR_FILL } from '~/media/shared/color-fill-types';
import { DEFAULT_COLOR_LAYER_STYLE } from '~/media/shared/color-layer-style';
import { DEFAULT_SHAPE_LAYER_STYLE } from '~/media/shared/shape-layer-style';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import {
  type BlurClip,
  type ColorClip,
  type MediaAsset,
  type ShapeClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { createComposition } from '../../composition/engine/clip-engine';
import type { AddVisualElementRequest, TimelineAddableVisualKind } from '../../composition/visual-element-types';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';
import { useClipComposition } from '../useClipComposition';

const { capture } = vi.hoisted(() => ({ capture: { pickProjectMedia: vi.fn() } }));
vi.mock('../../../../api/capture', () => ({ capture }));

const project: CaptureProject = {
  id: 'project-1',
  name: 'Project',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  sessionCount: 1,
  previewSrc: null,
};

const imageAsset = (): MediaAsset => ({
  id: 'image-asset',
  kind: 'image',
  name: 'Poster',
  fileName: 'poster.png',
  durationMs: 5_000,
  width: 800,
  height: 600,
  src: 'poster.png',
  origin: 'project',
});

const baseClip = {
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
};

const imageClip = (): VisualClip => ({
  ...baseClip,
  id: 'image-original',
  trackId: 'image-track',
  kind: 'image',
  name: 'Original image',
  assetId: 'image-asset',
  order: 4,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
});

const colorClip = (): ColorClip => ({
  ...baseClip,
  id: 'color-original',
  trackId: 'color-track',
  kind: 'color',
  name: 'Original color',
  assetId: '',
  order: 4,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  fill: structuredClone(DEFAULT_COLOR_FILL),
  ...DEFAULT_COLOR_LAYER_STYLE,
});

const shapeClip = (): ShapeClip => ({
  ...baseClip,
  id: 'shape-original',
  trackId: 'shape-track',
  kind: 'shape',
  name: 'Original shape',
  assetId: '',
  order: 4,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  ...DEFAULT_SHAPE_LAYER_STYLE,
});

const blurClip = (): BlurClip => ({
  ...baseClip,
  id: 'blur-original',
  trackId: 'blur-track',
  kind: 'blur',
  name: 'Original blur',
  assetId: '',
  order: 4,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 40,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
});

const targetFor = (kind: TimelineAddableVisualKind) =>
  kind === 'image' ? imageClip() : kind === 'color' ? colorClip() : kind === 'shape' ? shapeClip() : blurClip();

const mountComposable = () => {
  const currentTimeSec = ref(0);
  const activeTab = ref('canvas');
  const projectRef = ref<CaptureProject | null>(project);
  let state!: ReturnType<typeof useClipComposition>;
  mount(
    defineComponent({
      setup() {
        state = useClipComposition({
          project: projectRef,
          editorData: ref<ProjectEditorData | null>(null),
          currentTimeSec,
          activeTab,
          editorDefaults: ref(normalizeEditorPreferenceDefaults(undefined)),
        });
        return () => h('div');
      },
    }),
  );
  return { state, projectRef };
};

let randomUuid: MockInstance | undefined;

beforeEach(() => {
  capture.pickProjectMedia.mockReset();
  randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
});

afterEach(() => randomUuid?.mockRestore());

describe('useClipComposition visual continuation', () => {
  it.each(['color', 'blur', 'shape', 'image'] as const)(
    'continues a %s track with the requested duration, track, and order',
    async (kind) => {
      const mounted = mountComposable();
      const original = targetFor(kind);
      mounted.state.composition.value = createComposition(kind === 'image' ? [imageAsset()] : [], [original]);
      if (kind === 'image') capture.pickProjectMedia.mockResolvedValueOnce(imageAsset());

      const request: AddVisualElementRequest = {
        kind,
        trackId: original.trackId!,
        startMs: 4_000,
        durationMs: 1_250,
      };
      await mounted.state.addVisualElementAtTime(request);

      const clips = mounted.state.composition.value.clips.filter(
        (clip) => clip.kind === kind && 'trackId' in clip && clip.trackId === original.trackId,
      );
      expect(clips).toHaveLength(2);
      expect(clips[0]).toMatchObject({ id: original.id });
      expect(clips[1]).toMatchObject({
        kind,
        trackId: original.trackId,
        timelineStartMs: request.startMs,
        timelineDurationMs: request.durationMs,
        sourceDurationMs: request.durationMs,
      });
      expect(clips[1]!.order).toBe(clips[0]!.order);
      if (kind === 'image') {
        expect(capture.pickProjectMedia).toHaveBeenCalledWith(project.id, 'image');
      } else {
        expect(capture.pickProjectMedia).not.toHaveBeenCalled();
      }
    },
  );

  it('does not create a continuation when the requested visual track is incompatible', async () => {
    const mounted = mountComposable();
    mounted.state.composition.value = createComposition([], [colorClip()]);

    await mounted.state.addVisualElementAtTime({
      kind: 'shape',
      trackId: 'color-track',
      startMs: 4_000,
      durationMs: 1_000,
    });

    expect(mounted.state.composition.value.clips).toHaveLength(1);
  });
});
