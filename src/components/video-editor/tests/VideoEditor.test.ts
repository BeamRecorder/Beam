import './VideoEditor.test.setup';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { CaptionClip, ClipComposition, NormalizedCrop } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import {
  editorState,
  fullscreenState,
  historyState,
  mountEditor,
  setEditorComponent,
  toast,
} from './VideoEditor.test.setup';

const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);

const addInlineCaption = (): CaptionClip => {
  const composition = editorState.store.compositionState.composition.value as ClipComposition;
  const caption: CaptionClip = {
    id: 'caption-inline',
    kind: 'caption',
    name: 'Inline caption',
    timelineStartMs: 0,
    timelineDurationMs: 2_000,
    sourceInMs: 0,
    sourceDurationMs: 2_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 2,
    caption: {
      type: 'text',
      sentences: [
        {
          id: 'caption-inline-sentence',
          text: 'Original caption',
          startMs: 0,
          endMs: 2_000,
          words: [],
        },
      ],
      style: { ...createDefaultCaptionStyle(36), customText: 'Original caption' },
    },
  };
  composition.clips.push(caption);
  return caption;
};

const updateCaptionState = (clip: CaptionClip) => {
  const composition = editorState.store.compositionState.composition.value as ClipComposition;
  editorState.store.compositionState.composition.value = {
    ...composition,
    clips: composition.clips.map((candidate) => (candidate.id === clip.id ? clip : candidate)),
  };
};

const previewCrop: NormalizedCrop = { x: 0.05, y: 0.1, width: 0.8, height: 0.75 };
const cropModePreview: NormalizedCrop = { x: 0.15, y: 0.05, width: 0.7, height: 0.85 };
const committedCrop: NormalizedCrop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
const cropFromComposition = (composition: ClipComposition | undefined) => {
  const clip = composition?.clips.find((candidate) => candidate.id === 'screen');
  return clip && 'crop' in clip ? clip.crop : undefined;
};

describe('VideoEditor', () => {
  it('toggles Properties for the same tab and reopens it for a new selection', async () => {
    const mounted = mountEditor();
    const canvasTab = mounted.get('.sidebar-canvas-tab');
    const clipTab = mounted.get('.sidebar-clip-tab');

    expect(mounted.find('.mock-properties').exists()).toBe(true);
    await canvasTab.trigger('click');
    expect(mounted.find('.mock-properties').exists()).toBe(false);
    await canvasTab.trigger('click');
    expect(mounted.find('.mock-properties').exists()).toBe(true);

    await canvasTab.trigger('click');
    mounted.findComponent({ name: 'MockEditorCanvas' }).vm.$emit('select:clip', 'screen');
    await mounted.vm.$nextTick();
    expect(mounted.find('.mock-properties').exists()).toBe(true);
    expect(editorState.store.activeTab.value).toBe('clip');

    await clipTab.trigger('click');
    expect(mounted.find('.mock-properties').exists()).toBe(false);
  });

  it('initializes editor window state and emits topbar navigation events', async () => {
    const mounted = mountEditor();
    await flushPromises();
    await mounted.find('.back').trigger('click');
    await mounted.find('.open').trigger('click');
    expect(mounted.emitted('back-to-hud')).toHaveLength(1);
    expect(mounted.emitted('open-project')).toHaveLength(1);
  });

  it('connects the timeline fullscreen event to the canvas fullscreen controller', async () => {
    const mounted = mountEditor();

    await mounted.get('.timeline-fullscreen').trigger('click');

    expect(fullscreenState.toggle).toHaveBeenCalledOnce();
  });

  it('applies the fullscreen layout class and renders the back button after entering fullscreen', async () => {
    const mounted = mountEditor();

    await mounted.get('.timeline-fullscreen').trigger('click');
    await mounted.vm.$nextTick();

    expect(mounted.get('.canvas-preview-stage').classes()).toContain('is-app-fullscreen');
    expect(mounted.find('.fullscreen-preview-back').exists()).toBe(true);
  });

  it('opens Cursor and clears clip and zoom selection when the canvas cursor is clicked', async () => {
    const mounted = mountEditor();
    editorState.store.compositionState.selectedClipId.value = 'screen';
    editorState.store.zoomState.selectedZoomId.value = 'existing-zoom';
    await mounted.vm.$nextTick();

    mounted.findComponent({ name: 'MockEditorCanvas' }).vm.$emit('select:cursor');
    await mounted.vm.$nextTick();

    expect(editorState.store.activeTab.value).toBe('cursor');
    expect(editorState.store.compositionState.selectedClipId.value).toBeNull();
    expect(editorState.store.zoomState.selectedZoomId.value).toBeNull();
  });

  it('passes selectedBackgroundMedia to the ambient layer independently from the canvas grid', async () => {
    const mounted = mountEditor();
    const ambient = mounted.get('.mock-editor-ambient');

    editorState.store.outputCanvas.value = {
      ...editorState.store.outputCanvas.value,
      showBackground: true,
    };
    editorState.store.player.selectedBackground.value = { kind: 'color', color: '#ff0000' };
    await mounted.vm.$nextTick();
    expect(ambient.attributes('data-background-kind')).toBe('none');

    editorState.store.player.selectedBackgroundMedia.value = {
      id: 'wallpaper-image',
      name: 'Wallpaper image',
      kind: 'image',
      path: '/wallpapers/image/wallpaper.webp',
      extension: 'webp',
    };
    await mounted.vm.$nextTick();

    expect(ambient.attributes('data-background-kind')).toBe('image');
    expect(ambient.attributes('data-background-id')).toBe('wallpaper-image');
    expect(ambient.attributes('data-background-path')).toBe('/wallpapers/image/wallpaper.webp');
    expect(mounted.find('.canvas-3x3-grid').exists()).toBe(false);

    await mounted.get('.toggle-grid').trigger('click');
    expect(mounted.find('.canvas-3x3-grid').exists()).toBe(true);
    expect(mounted.get('.mock-editor-ambient').attributes('data-background-kind')).toBe('image');
  });

  it('hides the selected background from ambient and canvas rendering without clearing the selection', async () => {
    const mounted = mountEditor();
    const background = {
      id: 'wallpaper-image',
      name: 'Wallpaper image',
      kind: 'image' as const,
      path: '/wallpapers/image/wallpaper.webp',
      extension: 'webp',
    };

    editorState.store.player.selectedBackground.value = background;
    editorState.store.player.selectedBackgroundMedia.value = background;
    editorState.store.outputCanvas.value = {
      ...editorState.store.outputCanvas.value,
      showBackground: false,
    };
    await mounted.vm.$nextTick();

    expect(editorState.store.player.selectedBackground.value).toEqual(background);
    expect(editorState.store.player.selectedBackgroundMedia.value).toEqual(background);
    expect(mounted.get('.mock-editor-ambient').attributes('data-background-kind')).toBe('none');

    const canvas = mounted.findComponent({ name: 'MockEditorCanvas' });
    const attrs = canvas.vm.$attrs as Record<string, unknown>;
    const selectedBackground = Object.prototype.hasOwnProperty.call(attrs, 'selectedBackground')
      ? attrs.selectedBackground
      : attrs['selected-background'];
    expect(selectedBackground).toBeNull();
  });

  it('routes canvas, toolbar, timeline and property events to the editor state', async () => {
    const mounted = mountEditor();
    await mounted.find('.sidebar-tab').trigger('click');
    await mounted.find('.preset').trigger('click');
    await mounted.find('.import-background').trigger('click');
    await mounted.find('.system-volume').trigger('click');
    await mounted.find('.mic-volume').trigger('click');
    await mounted.find('.update-zoom').trigger('click');
    await mounted.find('.preview-zoom').trigger('click');
    await mounted.find('.transform').trigger('click');
    await mounted.find('.crop').trigger('click');
    await mounted.find('.done-crop').trigger('click');
    await mounted.find('.select-audio').trigger('click');
    expect(editorState.store.activeTab.value).toBe('clip');
    await mounted.find('.select-canvas').trigger('click');
    await mounted.find('.timeline-play').trigger('click');
    await mounted.find('.timeline-time').trigger('click');
    await mounted.find('.update-rate').trigger('click');
    await mounted.find('.update-volume').trigger('click');
    await mounted.find('.update-enabled').trigger('click');
    await mounted.find('.unlink').trigger('click');
    await mounted.find('.mirrored').trigger('click');
    await mounted.find('.appearance').trigger('click');
    await mounted.find('.reset-transform').trigger('click');
    await mounted.find('.timeline-delete-clips').trigger('click');
    await flushPromises();

    expect(editorState.store.handleSelectTab).toHaveBeenCalledWith('zoom');
    expect(editorState.store.player.addBackground).toHaveBeenCalledWith({ kind: 'color', color: '#f00' });
    expect(editorState.store.player.setPlaying).toHaveBeenCalledWith(true);
    expect(editorState.store.player.seek).toHaveBeenCalledWith(1.25, 'seek');
    expect(editorState.store.compositionState.selectClip).toHaveBeenCalledWith('audio');
    expect(editorState.store.compositionState.updateSelectedTransform).toHaveBeenCalled();
    expect(editorState.store.compositionState.updateSelectedVolume).toHaveBeenCalledWith(80);
    expect(editorState.store.compositionState.composition.value.clips).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'audio' })]),
    );
    expect(editorState.store.outputCanvas.value.preset).toBe('1:1');
  });

  it('relays timeline track selection to grouped and additive clip selection', async () => {
    const mounted = mountEditor();
    const timeline = mounted.findComponent({ name: 'MockEditorTimeline' });

    await mounted.get('.timeline-select-track').trigger('click');
    expect(editorState.store.compositionState.selectClips).toHaveBeenLastCalledWith(['screen'], 'screen');
    expect(editorState.store.compositionState.selectedClipIds.value).toEqual(['screen']);

    await mounted.get('.timeline-additive-track').trigger('click');
    expect(editorState.store.compositionState.selectClips).toHaveBeenLastCalledWith(['screen', 'audio'], 'audio');
    expect(editorState.store.compositionState.selectedClipIds.value).toEqual(['screen', 'audio']);
    expect(timeline.emitted('select:track')).toHaveLength(2);
  });

  it('opens linked deletion and keeps the dialog available for one or all linked clips', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    const current = state.compositionState.composition.value as ClipComposition;
    const video = current.clips.find((clip) => clip.id === 'screen')!;
    const audio = current.clips.find((clip) => clip.id === 'audio')!;
    const leftVideo = {
      ...video,
      id: 'left-video',
      groupId: 'left-group',
      timelineDurationMs: 120_000,
      sourceDurationMs: 120_000,
    };
    const rightVideo = {
      ...video,
      id: 'right-video',
      groupId: 'right-group',
      timelineStartMs: 120_000,
      timelineDurationMs: 7_000,
      sourceInMs: 120_000,
      sourceDurationMs: 7_000,
    };
    const leftAudio = {
      ...audio,
      id: 'left-audio',
      groupId: 'left-group',
      timelineDurationMs: 120_000,
      sourceDurationMs: 120_000,
    };
    const rightAudio = {
      ...audio,
      id: 'right-audio',
      groupId: 'right-group',
      timelineStartMs: 120_000,
      timelineDurationMs: 7_000,
      sourceInMs: 120_000,
      sourceDurationMs: 7_000,
    };
    state.compositionState.composition.value = {
      ...current,
      assets: current.assets.map((asset) => ({ ...asset, durationMs: 127_000 })),
      clips: [leftVideo, rightVideo, leftAudio, rightAudio],
    };
    await mounted.vm.$nextTick();

    mounted.findComponent({ name: 'MockEditorTimeline' }).vm.$emit('delete:clips', ['right-video']);
    await mounted.vm.$nextTick();

    const dialog = mounted.findComponent({ name: 'MockLinkedClipsDeleteDialog' });
    expect(dialog.exists()).toBe(true);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.attributes('data-clip-ids')).toBe('right-video,right-audio');

    await dialog.get('.dialog-delete-one').trigger('click');
    await mounted.vm.$nextTick();

    let remaining = state.compositionState.composition.value.clips as ClipComposition['clips'];
    expect(remaining.some((clip) => clip.id === 'right-video')).toBe(false);
    expect(remaining.some((clip) => clip.id === 'right-audio')).toBe(true);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.attributes('data-clip-ids')).toBe('right-audio');

    await dialog.get('.dialog-delete-all').trigger('click');
    await mounted.vm.$nextTick();

    remaining = state.compositionState.composition.value.clips as ClipComposition['clips'];
    expect(remaining.some((clip) => clip.id === 'right-video' || clip.id === 'right-audio')).toBe(false);
    expect(Math.max(...remaining.map((clip) => clip.timelineStartMs + clip.timelineDurationMs))).toBe(120_000);
    expect(dialog.props('isOpen')).toBe(true);
    expect(dialog.attributes('data-clip-ids')).toBe('');
  });

  it('deletes an unlinked clip immediately without opening the linked deletion dialog', async () => {
    const mounted = mountEditor();
    const timeline = mounted.findComponent({ name: 'MockEditorTimeline' });

    timeline.vm.$emit('delete:clips', ['audio']);
    await mounted.vm.$nextTick();

    expect(editorState.store.compositionState.composition.value.clips).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'audio' })]),
    );
    expect(mounted.findComponent({ name: 'MockLinkedClipsDeleteDialog' }).props('isOpen')).toBe(false);
  });

  it('applies composition previews without saving or recording history, while final updates save', async () => {
    const mounted = mountEditor();
    await flushPromises();
    const initialSnapshotCount = historyState.recordSnapshot.mock.calls.length;
    const scheduleSave = editorState.store.editorState.scheduleSave;

    await mounted.get('.preview-composition').trigger('click');
    await mounted.vm.$nextTick();

    expect(editorState.store.compositionState.composition.value.clips[0].transform.x).toBe(0);
    expect(mounted.get('.mock-canvas').attributes('data-composition-transform-x')).toBe('0.25');
    expect(scheduleSave).not.toHaveBeenCalled();
    expect(historyState.recordSnapshot).toHaveBeenCalledTimes(initialSnapshotCount);

    await mounted.get('.update-composition').trigger('click');
    await mounted.vm.$nextTick();

    expect(editorState.store.compositionState.composition.value.clips[0].transform.x).toBe(0.5);
    expect(mounted.get('.mock-canvas').attributes('data-composition-transform-x')).toBe('0.5');
    expect(scheduleSave).toHaveBeenCalledOnce();
  });

  it('routes property and canvas crop previews to the canvas without mutating canonical state, saving, or history', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    const canonicalBefore = JSON.stringify(state.compositionState.composition.value);
    const saveCallsBefore = state.editorState.scheduleSave.mock.calls.length;
    const recordCallsBefore = historyState.recordSnapshot.mock.calls.length;
    const commitCallsBefore = historyState.commitNow.mock.calls.length;
    const canvas = mounted.get('.mock-canvas');
    const properties = mounted.get('.mock-properties');

    await mounted.get('.preview-clip-crop').trigger('click');
    await mounted.vm.$nextTick();

    expect(JSON.stringify(state.compositionState.composition.value)).toBe(canonicalBefore);
    expect(canvas.attributes('data-composition-crop')).toBe(JSON.stringify(previewCrop));
    expect(properties.attributes('data-selected-crop')).toBe(JSON.stringify(previewCrop));
    expect(state.editorState.scheduleSave).toHaveBeenCalledTimes(saveCallsBefore);
    expect(historyState.recordSnapshot).toHaveBeenCalledTimes(recordCallsBefore);
    expect(historyState.commitNow).toHaveBeenCalledTimes(commitCallsBefore);

    const canvasPreviewCrop: NormalizedCrop = { x: 0.15, y: 0.05, width: 0.7, height: 0.85 };
    mounted.findComponent({ name: 'MockEditorCanvas' }).vm.$emit('preview:clip-crop', canvasPreviewCrop);
    await mounted.vm.$nextTick();

    expect(JSON.stringify(state.compositionState.composition.value)).toBe(canonicalBefore);
    expect(canvas.attributes('data-composition-crop')).toBe(JSON.stringify(canvasPreviewCrop));
    expect(properties.attributes('data-selected-crop')).toBe(JSON.stringify(canvasPreviewCrop));
    expect(state.editorState.scheduleSave).toHaveBeenCalledTimes(saveCallsBefore);
    expect(historyState.recordSnapshot).toHaveBeenCalledTimes(recordCallsBefore);
    expect(historyState.commitNow).toHaveBeenCalledTimes(commitCallsBefore);
  });

  it('commits one crop history state and clears the shared preview through undo and redo', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    const historyEntriesBefore = historyState.undoStack?.value.length ?? 0;
    const commitCallsBefore = historyState.commitNow.mock.calls.length;
    const saveCallsBefore = state.editorState.scheduleSave.mock.calls.length;

    await mounted.get('.update-clip-crop').trigger('click');
    await mounted.vm.$nextTick();

    const committedComposition = state.compositionState.composition.value as ClipComposition;
    const committed = committedComposition.clips.find((clip) => clip.id === 'screen');
    expect(committed?.kind).toBe('screen');
    expect(cropFromComposition(state.compositionState.composition.value)).toEqual(committedCrop);
    expect(mounted.get('.mock-canvas').attributes('data-composition-crop')).toBe(JSON.stringify(committedCrop));
    expect(mounted.get('.mock-properties').attributes('data-selected-crop')).toBe(JSON.stringify(committedCrop));
    expect(state.editorState.scheduleSave).toHaveBeenCalledTimes(saveCallsBefore + 1);
    expect(historyState.commitNow).toHaveBeenCalledTimes(commitCallsBefore + 2);
    expect(historyState.undoStack?.value).toHaveLength(historyEntriesBefore + 1);

    const cropCommitCalls = historyState.commitNow.mock.calls.slice(commitCallsBefore);
    expect(
      cropFromComposition((cropCommitCalls[0]?.[0] as { composition?: ClipComposition })?.composition),
    ).toBeUndefined();
    expect(cropFromComposition((cropCommitCalls[1]?.[0] as { composition?: ClipComposition })?.composition)).toEqual(
      committedCrop,
    );

    await mounted.get('.preview-clip-crop').trigger('click');
    await mounted.vm.$nextTick();
    expect(mounted.get('.mock-canvas').attributes('data-composition-crop')).toBe(JSON.stringify(previewCrop));

    await mounted.get('.undo').trigger('click');
    await flushPromises();
    await mounted.vm.$nextTick();
    expect(historyState.undo).toHaveBeenCalledOnce();
    expect(cropFromComposition(state.compositionState.composition.value)).toBeUndefined();
    expect(mounted.get('.mock-canvas').attributes('data-composition-crop')).toBe('null');
    expect(mounted.get('.mock-properties').attributes('data-selected-crop')).toBe('null');

    await mounted.get('.redo').trigger('click');
    await flushPromises();
    await mounted.vm.$nextTick();
    expect(historyState.redo).toHaveBeenCalledOnce();
    expect(cropFromComposition(state.compositionState.composition.value)).toEqual(committedCrop);
    expect(mounted.get('.mock-canvas').attributes('data-composition-crop')).toBe(JSON.stringify(committedCrop));
    expect(mounted.get('.mock-properties').attributes('data-selected-crop')).toBe(JSON.stringify(committedCrop));
    expect(state.editorState.scheduleSave).toHaveBeenCalledTimes(saveCallsBefore + 1);
  });

  it('finishes crop before selecting another clip', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    await mounted.get('.toggle-crop').trigger('click');
    await mounted.get('.canvas-preview-crop').trigger('click');
    await mounted.vm.$nextTick();
    expect(mounted.get('.mock-canvas').attributes('data-is-cropping')).toBe('true');

    await mounted.get('.select-audio').trigger('click');
    await mounted.vm.$nextTick();

    expect(cropFromComposition(state.compositionState.composition.value)).toEqual(cropModePreview);
    expect(state.compositionState.selectedClipId.value).toBe('audio');
    expect(mounted.get('.mock-canvas').attributes('data-is-cropping')).toBe('false');
  });

  it('keeps crop mode open when the same selection is assigned again', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    await mounted.get('.toggle-crop').trigger('click');
    await mounted.get('.canvas-preview-crop').trigger('click');
    await mounted.vm.$nextTick();

    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    expect(state.compositionState.selectedClipId.value).toBe('screen');
    expect(cropFromComposition(state.compositionState.composition.value)).toBeUndefined();
    expect(mounted.get('.mock-canvas').attributes('data-is-cropping')).toBe('true');
    expect(mounted.get('.mock-canvas').attributes('data-composition-crop')).toBe(JSON.stringify(cropModePreview));
  });

  it('finishes crop before adding a visual shape and leaves the shape manipulable', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    await mounted.get('.toggle-crop').trigger('click');
    await mounted.get('.canvas-preview-crop').trigger('click');
    await mounted.vm.$nextTick();

    mounted.findComponent({ name: 'MockEditorTimeline' }).vm.$emit('add:visual-element', {
      kind: 'shape',
      trackId: 'shape-track',
      startMs: 0,
      durationMs: 1_000,
    });
    await flushPromises();
    await mounted.vm.$nextTick();

    const composition = state.compositionState.composition.value as ClipComposition;
    const shape = composition.clips.find((clip) => clip.id === 'shape-1');
    expect(cropFromComposition(composition)).toEqual(cropModePreview);
    expect(shape).toMatchObject({ id: 'shape-1', kind: 'shape' });
    expect(shape).not.toHaveProperty('crop');
    expect(state.compositionState.selectedClipId.value).toBe('shape-1');
    expect(mounted.get('.mock-canvas').attributes('data-is-cropping')).toBe('false');
    expect(mounted.get('.mock-canvas').attributes('data-selected-transform-kind')).toBe('shape');
    expect(mounted.get('.mock-canvas').attributes('data-can-manipulate')).toBe('true');
  });

  it('commits the preview when the crop toolbar confirms', async () => {
    const mounted = mountEditor();
    const state = editorState.store;
    state.compositionState.selectClip('screen');
    await mounted.vm.$nextTick();

    await mounted.get('.toggle-crop').trigger('click');
    await mounted.get('.canvas-preview-crop').trigger('click');
    await mounted.vm.$nextTick();
    await mounted.get('.done-crop').trigger('click');
    await mounted.vm.$nextTick();

    expect(cropFromComposition(state.compositionState.composition.value)).toEqual(cropModePreview);
    expect(mounted.get('.mock-canvas').attributes('data-is-cropping')).toBe('false');
    expect(mounted.get('.mock-canvas').attributes('data-composition-crop')).toBe(JSON.stringify(cropModePreview));
  });

  it('groups spaced inline caption updates into one final history entry', async () => {
    const mounted = mountEditor();
    const caption = addInlineCaption();
    await mounted.vm.$nextTick();

    editorState.store.compositionState.updateCaption.mockImplementation((nextClip: CaptionClip) => {
      updateCaptionState(nextClip);
    });
    historyState.commitNow.mockClear();
    const canvas = mounted.findComponent({ name: 'MockEditorCanvas' });

    canvas.vm.$emit('caption-editing-start');
    canvas.vm.$emit('update:caption-text', { clipId: caption.id, customText: 'First edit' });
    await mounted.vm.$nextTick();
    canvas.vm.$emit('update:caption-text', { clipId: caption.id, customText: 'Second edit' });
    await mounted.vm.$nextTick();
    canvas.vm.$emit('update:caption-text', { clipId: caption.id, customText: 'Final edit' });
    await mounted.vm.$nextTick();

    expect(historyState.commitNow).toHaveBeenCalledTimes(1);

    canvas.vm.$emit('caption-editing-end', { cancelled: false });
    await mounted.vm.$nextTick();

    expect(historyState.commitNow).toHaveBeenCalledTimes(2);
    expect(historyState.commitNow.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        composition: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({
              id: caption.id,
              caption: expect.objectContaining({
                style: expect.objectContaining({ customText: 'Final edit' }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('commits once when inline caption editing finishes normally', async () => {
    const mounted = mountEditor();
    const caption = addInlineCaption();
    await mounted.vm.$nextTick();
    editorState.store.compositionState.updateCaption.mockImplementation((nextClip: CaptionClip) => {
      updateCaptionState(nextClip);
    });
    historyState.commitNow.mockClear();
    const canvas = mounted.findComponent({ name: 'MockEditorCanvas' });

    canvas.vm.$emit('caption-editing-start');
    canvas.vm.$emit('update:caption-text', { clipId: caption.id, customText: 'Committed edit' });
    await mounted.vm.$nextTick();
    canvas.vm.$emit('caption-editing-end', { cancelled: false });
    await mounted.vm.$nextTick();

    expect(historyState.commitNow).toHaveBeenCalledTimes(2);
    expect(historyState.commitNow.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        composition: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({
              id: caption.id,
              caption: expect.objectContaining({
                style: expect.objectContaining({ customText: 'Committed edit' }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('does not commit a second history entry when inline caption editing is cancelled', async () => {
    const mounted = mountEditor();
    const caption = addInlineCaption();
    await mounted.vm.$nextTick();
    editorState.store.compositionState.updateCaption.mockImplementation((nextClip: CaptionClip) => {
      updateCaptionState(nextClip);
    });
    historyState.commitNow.mockClear();
    const canvas = mounted.findComponent({ name: 'MockEditorCanvas' });

    canvas.vm.$emit('caption-editing-start');
    canvas.vm.$emit('update:caption-text', { clipId: caption.id, customText: 'Discarded edit' });
    await mounted.vm.$nextTick();
    canvas.vm.$emit('update:caption-text', { clipId: caption.id, customText: 'Original caption' });
    canvas.vm.$emit('caption-editing-end', { cancelled: true });
    await mounted.vm.$nextTick();

    expect(historyState.commitNow).toHaveBeenCalledTimes(1);
    expect(editorState.store.compositionState.composition.value.clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: caption.id,
          caption: expect.objectContaining({
            style: expect.objectContaining({ customText: 'Original caption' }),
          }),
        }),
      ]),
    );
  });

  it('shows the preview composition duration in the timeline toolbar and restores the canonical duration', async () => {
    const mounted = mountEditor();
    const composition = editorState.store.compositionState.composition.value as ClipComposition;
    const preview = {
      ...composition,
      clips: composition.clips.map((clip) =>
        clip.id === 'screen' ? { ...clip, timelineDurationMs: 3_500, sourceDurationMs: 3_500 } : clip,
      ),
    } satisfies ClipComposition;
    const timeline = mounted.findComponent({ name: 'MockEditorTimeline' });
    const toolbar = () => mounted.findComponent({ name: 'MockTimelineToolbar' });

    expect(toolbar().attributes('duration')).toBe('2');

    timeline.vm.$emit('preview:composition', preview);
    await mounted.vm.$nextTick();
    expect(toolbar().attributes('duration')).toBe('3.5');

    timeline.vm.$emit('preview:composition', null);
    await mounted.vm.$nextTick();
    expect(toolbar().attributes('duration')).toBe('2');
  });

  it('keeps the canvas background enabled when changing the output format', async () => {
    const mounted = mountEditor();
    editorState.store.outputCanvas.value = {
      ...editorState.store.outputCanvas.value,
      showBackground: true,
    };
    await mounted.vm.$nextTick();

    await mounted.find('.preset').trigger('click');

    expect(editorState.store.outputCanvas.value).toMatchObject({
      preset: '1:1',
      width: 1080,
      height: 1080,
      showBackground: true,
    });
  });

  it('shows one copyable playback error toast per error instead of one per seek', async () => {
    const mounted = mountEditor();
    const playbackError = {
      kind: 'decode-failure' as const,
      sourceId: 'screen-asset',
      message: 'The video could not be decoded.',
    };

    editorState.store.player.playbackError.value = playbackError;
    await mounted.vm.$nextTick();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining(playbackError.message),
      expect.any(Number),
      expect.objectContaining({ label: expect.stringMatching(/copy/i), copyText: expect.any(String) }),
    );
    const copyAction = toast.error.mock.calls[0]?.[2] as { copyText: string };
    const copied = JSON.parse(copyAction.copyText) as { error: { kind: string } };
    expect(copied.error.kind).toBe('decode-failure');

    await mounted.get('.timeline-time').trigger('click');
    editorState.store.player.playbackError.value = { ...playbackError };
    await mounted.vm.$nextTick();
    expect(toast.error).toHaveBeenCalledTimes(1);

    editorState.store.player.playbackError.value = { ...playbackError, message: 'A different decode failure.' };
    await mounted.vm.$nextTick();
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it('confirms a timeline copy with a translated success toast', async () => {
    const mounted = mountEditor();

    await mounted.get('.timeline-copy').trigger('click');
    await mounted.vm.$nextTick();

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Copied: screen.mp4', 1_500, undefined, { leadingIcon: 'copy' });
  });

  it('rejects a pasted item from another project without mutating the timeline', async () => {
    const mounted = mountEditor();
    const compositionBefore = JSON.stringify(editorState.store.compositionState.composition.value);

    await mounted.get('.timeline-paste-invalid').trigger('click');
    await mounted.vm.$nextTick();

    expect(JSON.stringify(editorState.store.compositionState.composition.value)).toBe(compositionBefore);
    expect(editorState.store.editorState.scheduleSave).not.toHaveBeenCalled();
    expect(historyState.commitNow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('project'), expect.any(Number));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('pastes a clip at the playhead, overwrites its destination range, selects it and saves', async () => {
    const mounted = mountEditor();

    await mounted.get('.timeline-paste-clip').trigger('click');
    await mounted.vm.$nextTick();

    const composition = editorState.store.compositionState.composition.value as ClipComposition;
    const pasted = composition.clips.find(
      (clip) => clip.kind === 'screen' && clip.timelineStartMs === 1_000 && clip.timelineDurationMs === 1_000,
    );
    expect(pasted).toBeDefined();
    expect(composition.clips.filter((clip) => clip.kind === 'screen')).toHaveLength(2);
    expect(editorState.store.compositionState.selectClip).toHaveBeenCalledWith(pasted!.id);
    expect(editorState.store.compositionState.selectedClipId.value).toBe(pasted!.id);
    expect(editorState.store.activeTab.value).toBe('clip');
    expect(editorState.store.editorState.scheduleSave).toHaveBeenCalled();
    expect(historyState.commitNow).toHaveBeenCalledWith(expect.objectContaining({ composition }));
    expect(toast.success).toHaveBeenCalledWith('Pasted: screen.mp4', 1_500, undefined, { leadingIcon: 'paste' });
  });

  it('delegates zoom pasting and keeps the pasted zoom selected', async () => {
    const mounted = mountEditor();

    await mounted.get('.timeline-paste-zoom').trigger('click');
    await mounted.vm.$nextTick();

    expect(editorState.store.zoomState.pasteZoomAtTime).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'copied-zoom', startMs: 0, endMs: 500 }),
      1_000,
    );
    expect(editorState.store.zoomState.selectedZoomId.value).toBe('pasted-zoom');
    expect(editorState.store.activeTab.value).toBe('zoom');
    expect(editorState.store.compositionState.selectedClipId.value).toBeNull();
    expect(historyState.commitNow).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Pasted: Zoom 1', 1_500, undefined, { leadingIcon: 'paste' });
  });

  it('keeps the latest paste highlight alive and expires it 900ms after the latest paste', async () => {
    vi.useFakeTimers();
    try {
      const mounted = mountEditor();
      const timeline = () => mounted.get('.mock-editor-timeline');

      await mounted.get('.timeline-paste-clip').trigger('click');
      const firstPasteId = timeline().attributes('data-recent-paste-id');
      expect(timeline().attributes('data-recent-paste-type')).toBe('clip');
      expect(firstPasteId).toBeTruthy();

      vi.advanceTimersByTime(450);
      await mounted.get('.timeline-paste-zoom').trigger('click');
      expect(timeline().attributes('data-recent-paste-type')).toBe('zoom');
      expect(timeline().attributes('data-recent-paste-id')).toBe('pasted-zoom');

      // The first timer would have expired by now if the second paste had not replaced it.
      vi.advanceTimersByTime(899);
      await mounted.vm.$nextTick();
      expect(timeline().attributes('data-recent-paste-type')).toBe('zoom');

      vi.advanceTimersByTime(1);
      await mounted.vm.$nextTick();
      expect(timeline().attributes('data-recent-paste-type')).toBe('');
      expect(timeline().attributes('data-recent-paste-id')).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
