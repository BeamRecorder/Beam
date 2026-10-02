import './VideoEditor.test.setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import type { EditorWorkspaceContext } from '../workspace/workspace-types';
import type { useEditorVoiceover } from '../voiceover/useEditorVoiceover';
import type { useAudioNormalization } from '../composables/useAudioNormalization';
import { capture, mountEditor, setEditorComponent } from './VideoEditor.test.setup';

const bridges = vi.hoisted(() => ({
  voiceover: undefined as Parameters<typeof useEditorVoiceover>[0] | undefined,
  normalization: undefined as Parameters<typeof useAudioNormalization>[0] | undefined,
  openVoiceover: vi.fn(),
  normalize: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
}));
vi.mock('../voiceover/useEditorVoiceover', async () => {
  const { reactive, ref } = await import('vue');
  return {
    useEditorVoiceover: (options: Parameters<typeof useEditorVoiceover>[0]) => {
      bridges.voiceover = options;
      const isOpen = ref(false);
      bridges.openVoiceover.mockImplementation(() => {
        isOpen.value = true;
      });
      return {
        isOpen,
        open: bridges.openVoiceover,
        discard: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        selectMicrophone: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        toggleMonitoring: vi.fn(),
        updateCountdown: vi.fn(),
        state: reactive({
          phase: 'idle',
          microphones: [],
          selectedMicrophoneId: null,
          countdownSeconds: 0,
          countdownRemaining: 0,
          monitorProjectAudio: true,
          elapsedLabel: '0:00',
          previewBars: [],
          draft: null,
          error: null,
        }),
      };
    },
  };
});
vi.mock('../composables/useAudioNormalization', () => ({
  useAudioNormalization: (options: Parameters<typeof useAudioNormalization>[0]) => {
    bridges.normalization = options;
    return { statuses: {}, errors: {}, normalizeClipIds: bridges.normalize, resetClipIds: bridges.reset };
  },
}));

const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);
const workspaceOf = (mounted: VueWrapper) =>
  (mounted.findComponent({ name: 'VideoEditorPreview' }).vm as unknown as { workspace: EditorWorkspaceContext })
    .workspace;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  bridges.normalize.mockResolvedValue(undefined);
  capture.pasteProjectClipboardImage.mockResolvedValue(null);
});

describe('VideoEditor workspace host bindings', () => {
  it('keeps every properties model connected to its shared editor state', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const panel = mounted.findComponent({ name: 'MockProperties' });
    const values = [
      ['cursor-selection', 'cursorSelection', { packId: 'builtin:macos', mode: 'fixed', cursorId: 'pointer' }],
      ['cursor-size', 'cursorSize', 36],
      ['cursor-color', 'cursorColor', '#123456'],
      ['enable-shadow', 'enableShadow', false],
      ['shadow-blur', 'shadowBlur', 12],
      ['shadow-color', 'shadowColor', '#abcdef'],
      ['shadow-direction', 'shadowDirection', 'all'],
      ['click-effects', 'clickEffects', { enabled: false }],
      ['motion', 'cursorMotion', { preset: 'smooth' }],
      ['auto-hide', 'cursorAutoHide', { enabled: true, delaySeconds: 1, fadeDurationMs: 200 }],
      ['volume', 'volume', 75],
      ['system-volume', 'systemVolume', 80],
      ['mic-volume', 'micVolume', 40],
      ['is-system-audio-enabled', 'isSystemAudioEnabled', false],
      ['is-mic-audio-enabled', 'isMicAudioEnabled', false],
      ['selected-background', 'selectedBackground', null],
      ['blur-percent', 'backgroundBlurPercent', 15],
      ['canvas', 'outputCanvas', { ...workspace.outputCanvas.value, showBackground: true }],
    ] as const;
    for (const [event, key, value] of values) {
      panel.vm.$emit(`update:${event}`, value);
      await nextTick();
      // Role volume only changes existing clips; this fixture has no microphone clip.
      if (key !== 'micVolume') expect(workspace[key].value).toEqual(value);
    }
    panel.vm.$emit('preview:cursor-selection', null);
    panel.vm.$emit('corner-radius-interaction', true);
    panel.vm.$emit('back-to-hud');
    await nextTick();
    expect(workspace.transformHandlesMuted.value).toBe(true);
    expect(mounted.emitted('back-to-hud')).toHaveLength(1);
  });

  it('forwards appearance, normalization and camera controls without losing payloads', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const panel = mounted.findComponent({ name: 'MockProperties' });
    for (const radius of ['full', '25']) panel.vm.$emit('update:clip-corner-radius', radius);
    panel.vm.$emit('update:clip-shadow', { size: 'sm' });
    panel.vm.$emit('update:clip-shadow', {
      size: 'custom',
      blur: 20,
      mode: 'adaptive',
      color: '#fff',
      direction: 'all',
    });
    panel.vm.$emit('update:clip-appearance', { shadowBlur: 18 });
    panel.vm.$emit('update:blur', { strength: 30 });
    panel.vm.$emit('update:clip-is-mirrored-y', true);
    panel.vm.$emit('update:camera-layout', 'split');
    panel.vm.$emit('update:camera-framing', 'cover');
    panel.vm.$emit('update:camera-split-ratio', 0.4);
    panel.vm.$emit('update:camera-split-padding', 10);
    panel.vm.$emit('update:webcam-react-to-zoom', true);
    panel.vm.$emit('normalize:audio', ['audio']);
    panel.vm.$emit('reset:audio-normalization', ['audio']);
    panel.vm.$emit('generate:zooms');
    panel.vm.$emit('update:zoom-motion-blur', { enabled: false });
    panel.vm.$emit('update:zoom-auto-follow', { enabled: false });
    panel.vm.$emit('split-clip');
    await nextTick();
    expect(workspace.updateSelectedAppearance).toHaveBeenCalledWith({ cornerRadius: 25 });
    expect(workspace.updateSelectedAppearance).toHaveBeenCalledWith(expect.objectContaining({ shadowBlur: 40 }));
    expect(workspace.updateSelectedCameraSplitRatio).toHaveBeenCalledWith(0.4);
    expect(workspace.updateSelectedCameraSplitPadding).toHaveBeenCalledWith(10);
    expect(workspace.updateSelectedWebcamReactToZoom).toHaveBeenCalledWith(true);
    expect(bridges.normalize).toHaveBeenCalledWith(['audio']);
    expect(bridges.reset).toHaveBeenCalledWith(['audio']);
    expect(workspace.generateZooms).toHaveBeenCalledOnce();
    expect(workspace.splitSelectedClip).toHaveBeenCalledOnce();
  });

  it('retains canvas refs, transforms, grid and playback toolbar models', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const canvas = mounted.findComponent({ name: 'MockEditorCanvas' });
    const toolbar = mounted.findComponent({ name: 'MockTimelineToolbar' });
    expect(workspace.canvasPreviewStageRef.value).toBeInstanceOf(HTMLElement);
    canvas.vm.$emit('update:cursor-size', 50);
    canvas.vm.$emit('update:clip-transforms', [
      { id: 'screen', transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } },
    ]);
    canvas.vm.$emit('deselect:transform-clip');
    canvas.vm.$emit('deselect:zoom');
    toolbar.vm.$emit('update:zoom-level', 2);
    toolbar.vm.$emit('update:is-snapping-enabled', false);
    toolbar.vm.$emit('update:preview-quality', 'half');
    toolbar.vm.$emit('split');
    await nextTick();
    expect(workspace.cursorSize.value).toBe(50);
    expect(workspace.updateSelectedTransforms).toHaveBeenCalledOnce();
    expect(workspace.selectedClipId.value).toBeNull();
    expect(workspace.timelineZoomLevel.value).toBe(2);
    expect(workspace.isSnappingEnabled.value).toBe(false);
    expect(workspace.previewQuality.value).toBe('half');
  });

  it('forwards timeline actions and keeps canvas transition refs usable', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const timeline = mounted.findComponent({ name: 'MockEditorTimeline' });
    timeline.vm.$emit('hold:clip', { id: 'screen', timeMs: 500 });
    timeline.vm.$emit('trim:clip', { id: 'screen', edge: 'end', timeMs: 1500 });
    timeline.vm.$emit('move:clip', { id: 'screen', startMs: 200 });
    timeline.vm.$emit('trim:zoom', { id: 'z', edge: 'end', timeMs: 1000 });
    timeline.vm.$emit('move:zoom', { id: 'z', startMs: 100, endMs: 1000 });
    timeline.vm.$emit('add:zoom', 300);
    timeline.vm.$emit('add:caption', 300);
    timeline.vm.$emit('reorder:clip', { id: 'screen', targetIndex: 1 });
    timeline.vm.$emit('reorder:caption', { id: 'caption', targetIndex: 0 });
    timeline.vm.$emit('normalize:audio', ['audio']);
    timeline.vm.$emit('update:zoom-level', 3);
    timeline.vm.$emit('update:canvas', { ...workspace.outputCanvas.value, showBackground: true });
    timeline.vm.$emit('open:canvas-transition', 'exit');
    await nextTick();
    expect(workspace.holdClip).toHaveBeenCalledWith('screen', 500);
    expect(workspace.trimClipEdge).toHaveBeenCalledWith('screen', 'end', 1500);
    expect(workspace.moveClipTo).toHaveBeenCalledWith('screen', 200);
    expect(workspace.addZoomAtTime).toHaveBeenCalledWith(300);
    expect(workspace.addCaptionAtTime).toHaveBeenCalledWith(300);
    expect(workspace.reorderCaptionClip).toHaveBeenCalledWith('caption', 0);
    expect(workspace.timelineCanvasPreview.value).toBeNull();
    expect(workspace.outputCanvas.value.showBackground).toBe(true);
    expect(workspace.activeTab.value).toBe('canvas');
    expect(workspace.propertiesPanelRef.value).not.toBeNull();
  });

  it('prepares voiceover and normalization through explicit commit callbacks', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    mounted.findComponent({ name: 'MockEditorTimeline' }).vm.$emit('add:element', 'voiceover');
    await nextTick();
    expect(bridges.openVoiceover).toHaveBeenCalledOnce();
    workspace.voiceoverState.draft = { startMs: 500, durationMs: 3000, bars: [] };
    expect(workspace.timelineBaseDuration.value).toBe(3.5);
    const options = bridges.voiceover!;
    expect(options.projectId()).toBe('project-1');
    await options.seek(0.75);
    expect(workspace.player.seek).toHaveBeenCalledWith(0.75);
    const asset = workspace.composition.value.assets[0]!;
    options.insert(
      asset,
      {
        kind: 'audio',
        durationMs: 1000,
        width: null,
        height: null,
        hasAudio: true,
        canDecodeAudio: true,
        audioCodec: 'pcm',
      },
      500,
    );
    await options.normalize('audio');
    options.onCommit();
    bridges.normalization!.onCommit?.();
    expect(workspace.addImportedAsset).toHaveBeenCalledWith(asset, expect.any(Object), 500, undefined, 'voiceover');
    expect(workspace.editorState.scheduleSave).toHaveBeenCalled();
  });

  it('owns one history copy even when the live presentation state changes afterwards', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    workspace.commitNow(workspace.createEditorSnapshot());
    const first = workspace.composition.value.clips[0]!;
    const oldName = first.name;
    workspace.composition.value.clips[0]!.name = 'Changed after commit';
    workspace.commitNow(workspace.createEditorSnapshot());
    await workspace.undo();
    expect(workspace.composition.value.clips[0]!.name).toBe(oldName);
  });

  it('prevents duplicate clipboard imports and resets its state after failure or no image', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    let release!: (value: null) => void;
    capture.pasteProjectClipboardImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = workspace.pasteClipboardImage();
    await workspace.pasteClipboardImage();
    expect(capture.pasteProjectClipboardImage).toHaveBeenCalledOnce();
    release(null);
    await pending;
    expect(workspace.isPastingClipboardImage.value).toBe(false);
    capture.pasteProjectClipboardImage.mockRejectedValueOnce(new Error('clipboard failed'));
    await expect(workspace.pasteClipboardImage()).rejects.toThrow('clipboard failed');
    expect(workspace.isPastingClipboardImage.value).toBe(false);
    const asset = { ...workspace.composition.value.assets[0]!, width: 100, height: 50 };
    capture.pasteProjectClipboardImage.mockResolvedValueOnce(asset);
    await workspace.pasteClipboardImage();
    expect(workspace.addImportedAsset).toHaveBeenCalledWith(
      asset,
      expect.objectContaining({ kind: 'image', width: 100 }),
      0,
    );
  });
});
