import { describe, it, expect, vi, beforeEach } from 'vitest';
import { effectScope, ref, computed, nextTick } from 'vue';
import { createRenderDocument, createStillDocument } from '@beam/engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { useScreenshotAuthoring } from './useScreenshotAuthoring';
import { useVideoAuthoring } from './useVideoAuthoring';
import { useHtmlPreview } from './useHtmlPreview';
import type { AuthoringHost } from './authoring-host-types';
import type { ScreenshotDocument } from '~/api/types/screenshot';
import type { ScreenshotAuthoringOptions } from './screenshot-authoring-types';
import type { EditorWorkspaceState } from '../editor/workspace/workspace-types';
import type { useEditorWorkspaceHistory } from '../editor/workspace/useEditorWorkspaceHistory';
import type { StillDocument } from '@beam/engine/screenshot/still-document-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { BackgroundValue } from '@beam/engine/shared/background-types';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';

const hooks = vi.hoisted(() => ({ host: vi.fn(), render: vi.fn() }));
vi.mock('./useAuthoringHost', () => ({ useAuthoringHost: hooks.host }));
vi.mock('~/api/capture', () => ({ capture: { renderHtmlFrame: hooks.render } }));
beforeEach(() => {
  vi.clearAllMocks();
});
describe('desktop document adapters', () => {
  it('adapts Screenshot state and the existing history without inventing source dimensions', () => {
    const still = createStillDocument('project', 'source.png', 64, 64);
    const document = ref<ScreenshotDocument | null>({
      ...still,
      name: 'Screenshot',
      preset: {} as ScreenshotDocument['preset'],
    });
    const state = ref(still.state),
      commitNow = vi.fn(),
      undo = vi.fn(async () => {}),
      redo = vi.fn(async () => {}),
      save = vi.fn(async () => {});
    const history = {
      commitNow,
      undo,
      redo,
      restoring: ref(false),
      canUndo: ref(true),
      canRedo: ref(false),
    } as unknown as ScreenshotAuthoringOptions['history'];
    const options = { document, state, history, disabled: () => false, save };
    useScreenshotAuthoring(options);
    const host = hooks.host.mock.calls[0]![0] as AuthoringHost<StillDocument>;
    expect(host.context()).toEqual({ projectId: 'project', name: 'Screenshot', kind: 'image' });
    expect(host.read()).toEqual({ ...still, fontSources: {} });
    host.apply({ ...still, state: { ...still.state, quality: 0.5 } });
    expect(state.value.quality).toBe(0.5);
    expect(commitNow).toHaveBeenCalledTimes(2);
    expect(host.canUndo()).toBe(true);
    expect(host.canRedo()).toBe(false);
    expect(host.canEdit()).toBe(true);
    Object.assign(history, { restoring: ref(true) });
    expect(host.canEdit()).toBe(false);
    document.value = null;
    expect(host.context()).toBeNull();
    expect(() => host.read()).toThrow('not ready');
  });
  function video() {
    const snapshot = createRenderDocument(undefined, 64, 64),
      composition = ref(snapshot.composition),
      zooms = ref(snapshot.zooms);
    const outputCanvas = ref(snapshot.canvas),
      selectedBackground = ref<BackgroundValue | null>(null),
      blur = ref(0);
    const state = {
      props: { project: { id: 'project', name: 'Video' } },
      projectStateReady: ref(true),
      editorState: { loading: ref(false), saveNow: vi.fn(async () => {}) },
      compositionState: {
        restoreComposition: (value: typeof composition.value) => {
          composition.value = value;
        },
      },
      zoomState: {
        restoreZoomElements: (value: typeof zooms.value) => {
          zooms.value = value;
        },
      },
      zoomMotionBlur: ref(),
      zoomAutoFollow: ref(),
      outputCanvas,
      selectedBackground,
      backgroundBlurPercent: blur,
      backgroundGroups: ref([
        { items: [{ id: 'bg', path: 'background.png', kind: 'image', name: 'BG', extension: 'png' }] },
      ]),
      exportRequest: ref({
        createSnapshot: () => ({
          ...snapshot,
          composition: composition.value,
          canvas: outputCanvas.value,
          background:
            selectedBackground.value &&
            ('path' in selectedBackground.value
              ? { kind: selectedBackground.value.kind, src: selectedBackground.value.path }
              : selectedBackground.value),
          zooms: zooms.value,
          blurPercent: blur.value,
        }),
      }),
      isInlineCaptionEditing: ref(false),
      isExporting: ref(false),
      timelineCompositionPreview: ref(null),
      layerCompositionPreview: ref(null),
      cropCompositionPreview: ref(null),
      timelineZoomPreview: ref(null),
      timelineCanvasPreview: ref(null),
    } as unknown as EditorWorkspaceState;
    const history = {
      commitNow: vi.fn(),
      createEditorSnapshot: vi.fn(() => ({ composition: composition.value })),
      undo: vi.fn(async () => {}),
      redo: vi.fn(async () => {}),
      canUndo: ref(true),
      canRedo: ref(false),
    } as unknown as ReturnType<typeof useEditorWorkspaceHistory>;
    useVideoAuthoring(state, history);
    return { state, history, host: hooks.host.mock.lastCall![0] as AuthoringHost<CompositionSnapshot>, snapshot };
  }
  it('applies video presentation through history and rejects unavailable backgrounds before any change', () => {
    const { host, history, state, snapshot } = video();
    host.apply({ ...snapshot, background: { kind: 'color', color: '#112233' }, blurPercent: 12 });
    expect(state.selectedBackground.value).toMatchObject({ kind: 'color', color: '#112233' });
    expect(state.backgroundBlurPercent.value).toBe(12);
    expect(history.commitNow).toHaveBeenCalledTimes(2);
    expect(host.canUndo()).toBe(true);
    expect(host.canRedo()).toBe(false);
    host.apply({ ...snapshot, background: { kind: 'image', src: 'background.png' } });
    expect(state.selectedBackground.value).toHaveProperty('id', 'bg');
    expect(() => host.apply({ ...snapshot, background: { kind: 'image', src: 'missing.png' } })).toThrow(
      'Import the background',
    );
    expect(history.commitNow).toHaveBeenCalledTimes(4);
    expect(host.context()?.kind).toBe('video');
  });
  it('gates video readiness and gestures and supports null/gradient background changes', async () => {
    const { host, state, snapshot } = video();
    state.projectStateReady.value = false;
    expect(host.context()).toBeNull();
    state.projectStateReady.value = true;
    expect(host.canEdit()).toBe(true);
    beginPropertyInteraction();
    expect(host.canEdit()).toBe(false);
    endPropertyInteraction();
    state.isInlineCaptionEditing.value = true;
    expect(host.canEdit()).toBe(false);
    state.isInlineCaptionEditing.value = false;
    host.apply({
      ...snapshot,
      background: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 0,
          stops: [
            { id: 'a', position: 0, color: '#000000', alpha: 1 },
            { id: 'b', position: 1, color: '#ffffff', alpha: 1 },
          ],
        },
      },
    });
    host.apply({ ...snapshot, background: null });
    expect(state.selectedBackground.value).toBeNull();
    await host.save();
    expect(state.editorState.saveNow).toHaveBeenCalledTimes(1);
    state.exportRequest = computed(() => null);
    expect(() => host.read()).toThrow('not ready');
  });
  it('renders HTML frames at the evaluated source clock, reacts to source updates and closes bitmaps', async () => {
    const composition = ref(createRenderDocument().composition),
      time = ref(0),
      changed = vi.fn(),
      failed = vi.fn();
    const pixels = { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => pixels),
    );
    hooks.render.mockResolvedValue(new Uint8Array());
    const scope = effectScope();
    let preview!: ReturnType<typeof useHtmlPreview>;
    scope.run(() => {
      preview = useHtmlPreview(composition, time, changed, failed);
    });
    composition.value.assets.push({
      id: 'html',
      kind: 'image',
      origin: 'project',
      name: 'HTML',
      src: 'preview.png',
      fileName: 'preview.png',
      width: 64,
      height: 64,
      durationMs: 0,
      html: {
        version: 1,
        id: 'html',
        revision: 'revision',
        entry: 'index.html',
        width: 64,
        height: 64,
        durationMs: 15000,
        fps: 30,
        framework: 'html',
      },
    });
    composition.value.clips.push({
      id: 'clip',
      assetId: 'html',
      kind: 'image',
      name: 'HTML',
      timelineStartMs: 1000,
      timelineDurationMs: 1000,
      sourceInMs: 200,
      sourceDurationMs: 1000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('image'),
      isMirrored: false,
      isMirroredY: false,
    });
    time.value = 1.5;
    await nextTick();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(hooks.render).toHaveBeenCalledWith(expect.objectContaining({ revision: 'revision' }), 700);
    expect(preview.frameFor('clip')).not.toBeNull();
    composition.value.assets[0]!.html!.durationMs = 0;
    await nextTick();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(hooks.render).toHaveBeenLastCalledWith(expect.anything(), 0);
    scope.stop();
    expect(pixels.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
