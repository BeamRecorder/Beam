import './VideoEditor.test.setup';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import type { EditorWorkspaceContext } from '../workspace/workspace-types';
import type { useEditorMediaDrop } from '../composables/useEditorMediaDrop';
import type { useClipboardImagePaste } from '../composables/useClipboardImagePaste';
import { capture, mountEditor, setEditorComponent, toast } from './VideoEditor.test.setup';
const imports = vi.hoisted(() => ({
  drop: undefined as Parameters<typeof useEditorMediaDrop>[0] | undefined,
  paste: undefined as Parameters<typeof useClipboardImagePaste>[0] | undefined,
}));
vi.mock('../composables/useEditorMediaDrop', async () => {
  const { ref } = await import('vue');
  return {
    useEditorMediaDrop: (options: Parameters<typeof useEditorMediaDrop>[0]) => {
      imports.drop = options;
      return {
        isDraggingMedia: ref(false),
        isImportingMedia: ref(false),
        onMediaDragEnter: vi.fn(),
        onMediaDragOver: vi.fn(),
        onMediaDragLeave: vi.fn(),
        onMediaDrop: vi.fn(),
      };
    },
  };
});
vi.mock('../composables/useClipboardImagePaste', () => ({
  useClipboardImagePaste: (options: Parameters<typeof useClipboardImagePaste>[0]) => {
    imports.paste = options;
  },
}));
const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);
const workspaceOf = (mounted: VueWrapper) =>
  (
    mounted.findComponent({ name: 'VideoEditorPreview' }).vm as unknown as {
      workspace: EditorWorkspaceContext;
    }
  ).workspace;

describe('VideoEditor workspace interaction boundaries', () => {
  it('imports media at the playhead, commits crop, and reports clipboard failures', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const options = imports.drop!;
    expect(options.projectId()).toBe('project-1');
    workspace.currentTime.value = 0.5;
    expect(options.currentTimeSeconds()).toBe(0.5);
    const asset = workspace.composition.value.assets[0]!;
    options.addImportedAsset(
      asset,
      {
        kind: 'image',
        durationMs: 1000,
        width: 100,
        height: 100,
        hasAudio: false,
        canDecodeAudio: false,
        audioCodec: null,
      },
      500,
    );
    expect(workspace.addImportedAsset).toHaveBeenCalledWith(asset, expect.any(Object), 500);
    expect(imports.paste!.disabled?.()).toBe(false);
    workspace.mediaDrop.isImportingMedia.value = true;
    expect(imports.paste!.disabled?.()).toBe(true);
    workspace.mediaDrop.isImportingMedia.value = false;
    expect(imports.paste!.preferInternal?.()).toBe(false);
    imports.paste!.onError(new Error('clipboard unavailable'));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('clipboard unavailable'));
    await mounted.setProps({ project: null });
    expect(options.projectId()).toBeNull();
    expect(imports.paste!.disabled?.()).toBe(true);
    await workspace.pasteClipboardImage();
    expect(capture.pasteProjectClipboardImage).not.toHaveBeenCalled();
  });

  it('keeps shape rotation drafts separate and commits one final document', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const canvas = mounted.findComponent({ name: 'MockEditorCanvas' });
    canvas.vm.$emit('preview:shape-rotation', 25);
    canvas.vm.$emit('update:shape-rotation', 25);
    expect(workspace.shapeCompositionPreview.value).toBeNull();
    await workspace.addVisualElementAtTime({
      kind: 'shape',
      trackId: 'shape-track',
      startMs: 0,
      durationMs: 1000,
    });
    await nextTick();
    const before = workspace.composition.value;
    canvas.vm.$emit('preview:shape-rotation', 35);
    await nextTick();
    expect(workspace.composition.value).toBe(before);
    expect(workspace.shapeCompositionPreview.value?.clips.find((clip) => clip.id === 'shape-1')).toMatchObject({
      rotation: 35,
    });
    canvas.vm.$emit('preview:shape-rotation', null);
    expect(workspace.shapeCompositionPreview.value).toBeNull();
    canvas.vm.$emit('update:shape-rotation', 35);
    await nextTick();
    expect(workspace.composition.value.clips.find((clip) => clip.id === 'shape-1')).toMatchObject({
      rotation: 35,
    });
    expect(workspace.editorState.scheduleSave).toHaveBeenCalled();
  });

  it('preserves additive clip and zoom selection and rejects invalid crop requests', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    workspace.selectedClipIds.value = ['screen'];
    workspace.selectEditorZoomTrack({
      zoomIds: ['z'],
      primaryZoomId: 'z',
      additive: true,
    });
    expect(workspace.selectedClipIds.value).toEqual(['screen']);
    workspace.selectEditorZoomTrack({
      zoomIds: ['next'],
      primaryZoomId: 'next',
    });
    expect(workspace.selectedClipIds.value).toEqual([]);
    workspace.selectEditorZoom('z');
    expect(workspace.selectedZoomIds.value).toEqual(['z']);
    workspace.startCrop('missing');
    workspace.startCrop('audio');
    expect(workspace.isCropping.value).toBe(false);
    workspace.selectEditorClip('screen');
    workspace.composition.value = {
      ...workspace.composition.value,
      clips: workspace.composition.value.clips.map((clip) => (clip.id === 'screen' ? { ...clip, locked: true } : clip)),
    };
    workspace.startCrop('screen');
    expect(workspace.isCropping.value).toBe(false);
    workspace.toggleCrop();
    expect(workspace.isCropping.value).toBe(false);
    workspace.updateInlineCaptionText({
      clipId: 'missing',
      customText: 'ignored',
    });
    workspace.updateInlineCaptionText({
      clipId: 'audio',
      customText: 'ignored',
    });
    expect(workspace.updateCaption).not.toHaveBeenCalled();
  });

  it('ignores redundant caption-end and already-prevented shortcuts, and splits only outside input fields', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    workspace.endInlineCaptionEditing({ cancelled: false });
    workspace.beginInlineCaptionEditing();
    workspace.beginInlineCaptionEditing();
    workspace.endInlineCaptionEditing({ cancelled: true });
    const prevented = new KeyboardEvent('keydown', {
      key: 'Delete',
      cancelable: true,
    });
    prevented.preventDefault();
    window.dispatchEvent(prevented);
    expect(workspace.composition.value.clips).toHaveLength(2);
    workspace.selectEditorClip('screen');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', cancelable: true }));
    expect(workspace.splitSelectedClip).toHaveBeenCalledOnce();
    const input = document.createElement('div');
    input.setAttribute('contenteditable', 'true');
    input.tabIndex = 0;
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', cancelable: true }));
    expect(workspace.splitSelectedClip).toHaveBeenCalledOnce();
    input.remove();
    workspace.isCropping.value = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(workspace.isCropping.value).toBe(false);
    workspace.canvasFullscreen.isFullscreen.value = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(workspace.selectedClipIds.value).toEqual(['screen']);
  });

  it('reports asynchronous playback and insertion failures without changing the document', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(workspace.player.setPlaying).mockRejectedValueOnce(new Error('play failed'));
    vi.mocked(workspace.player.seek).mockRejectedValueOnce(new Error('seek failed'));
    vi.mocked(workspace.addElement).mockRejectedValueOnce(new Error('import failed'));
    vi.mocked(workspace.addVisualElementAtTime).mockRejectedValueOnce(new Error('shape failed'));
    const before = workspace.composition.value;
    workspace.handlePlayingIntent(true);
    workspace.handleSeekIntent(1);
    workspace.addTimelineElement('image');
    workspace.addTimelineVisualElement({
      kind: 'shape',
      trackId: 'shape',
      startMs: 0,
      durationMs: 1000,
    });
    await nextTick();
    await nextTick();
    expect(error).toHaveBeenCalledTimes(4);
    expect(workspace.composition.value).toBe(before);
  });

  it('moves and deletes timeline selections while leaving no-op edits unchanged', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const timeline = mounted.findComponent({ name: 'MockEditorTimeline' });
    const before = workspace.composition.value;
    timeline.vm.$emit('move:selection', {
      clipIds: ['screen'],
      zoomIds: [],
      deltaMs: 0,
    });
    expect(workspace.composition.value).toBe(before);
    timeline.vm.$emit('move:selection', {
      clipIds: ['screen'],
      zoomIds: [],
      deltaMs: 100,
    });
    await nextTick();
    expect(workspace.composition.value.clips.find((clip) => clip.id === 'screen')?.timelineStartMs).toBe(100);
    timeline.vm.$emit('preview:canvas', workspace.outputCanvas.value);
    timeline.vm.$emit('paste:error', 'Clipboard invalid');
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Clipboard invalid'), 5000);
    timeline.vm.$emit('delete:selection', {
      clipIds: ['audio'],
      zoomIds: [],
      mode: 'lift',
    });
    await nextTick();
    expect(workspace.composition.value.clips.some((clip) => clip.id === 'audio')).toBe(false);
    timeline.vm.$emit('delete:zoom', 'missing');
    workspace.deleteSelectedTimelineZooms();
    workspace.selectedZoomId.value = 'missing';
    workspace.deleteSelectedTimelineZooms();
    workspace.selectedZoomIds.value = ['missing'];
    workspace.deleteSelectedTimelineZooms();
  });

  it('handles empty and role-specific property deletions without clearing unrelated clips', async () => {
    const mounted = mountEditor();
    const workspace = workspaceOf(mounted);
    const panel = mounted.findComponent({ name: 'MockProperties' });
    workspace.selectedClipId.value = null;
    workspace.selectedClipIds.value = [];
    panel.vm.$emit('delete-clip');
    panel.vm.$emit('delete:mic-audio');
    expect(workspace.composition.value.clips).toHaveLength(2);
    panel.vm.$emit('delete:system-audio');
    await nextTick();
    expect(workspace.composition.value.clips.map((clip) => clip.id)).toEqual(['screen']);
    workspace.selectedClipId.value = 'screen';
    panel.vm.$emit('delete-clip');
    await nextTick();
    expect(workspace.composition.value.clips).toHaveLength(0);
  });
});
