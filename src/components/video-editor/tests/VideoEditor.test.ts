import './VideoEditor.test.setup';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { editorState, historyState, mountEditor, setEditorComponent, toast } from './VideoEditor.test.setup';

const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);

describe('VideoEditor', () => {
  it('initializes editor window state and emits topbar navigation events', async () => {
    const mounted = mountEditor();
    await flushPromises();
    await mounted.find('.back').trigger('click');
    await mounted.find('.open').trigger('click');
    expect(mounted.emitted('back-to-hud')).toHaveLength(1);
    expect(mounted.emitted('open-project')).toHaveLength(1);
  });

  it('passes selectedBackgroundMedia to the ambient layer independently from the canvas grid', async () => {
    const mounted = mountEditor();
    const ambient = mounted.get('.mock-editor-ambient');

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
    await mounted.find('.add-sound').trigger('click');
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
    expect(editorState.store.compositionState.addElement).toHaveBeenCalledWith('sound');
    expect(editorState.store.compositionState.updateSelectedTransform).toHaveBeenCalled();
    expect(editorState.store.compositionState.updateSelectedVolume).toHaveBeenCalledWith(80);
    expect(editorState.store.compositionState.composition.value.clips).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'audio' })]),
    );
    expect(editorState.store.outputCanvas.value.preset).toBe('1:1');
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
});
