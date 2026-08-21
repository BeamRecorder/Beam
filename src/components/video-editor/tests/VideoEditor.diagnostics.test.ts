import './VideoEditor.test.setup';
import { describe, expect, it } from 'vitest';
import { editorState, mountEditor, setEditorComponent, toast } from './VideoEditor.test.setup';

const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);

describe('VideoEditor diagnostics and keyboard behavior', () => {
  it('enriches missing session asset errors and copies the diagnostic JSON', async () => {
    const mounted = mountEditor({
      editorData: {
        sessionId: 'session-42',
        manifest: { completed: false },
      } as any,
    });
    const screenAsset = editorState.store.compositionState.composition.value.assets.find(
      (asset: any) => asset.id === 'screen-asset',
    );
    Object.assign(screenAsset, {
      name: 'Screen recording',
      sessionId: 'session-42',
      sessionPath: 'screen/segment.webm',
    });
    editorState.store.player.playbackError.value = {
      kind: 'missing' as const,
      sourceId: 'screen-asset',
      message: 'The session media is missing.',
    };
    await mounted.vm.$nextTick();

    expect(toast.error).toHaveBeenCalledOnce();
    const [message, , action] = toast.error.mock.calls[0] as [string, number, { copyText: string }];
    expect(message).toContain('Project');
    expect(message).toContain('Screen recording');
    expect(message).toContain('session-session-42/screen/segment.webm');
    expect(message).toMatch(/not finalized/i);

    const copied = JSON.parse(action.copyText) as {
      project: { id: string; name: string };
      recordingSession: { id: string; completed: boolean };
      media: { id: string; name: string; expectedProjectPath: string };
    };
    expect(copied.project).toMatchObject({ id: 'project-1', name: 'Project' });
    expect(copied.recordingSession).toEqual({ id: 'session-42', completed: false });
    expect(copied.media).toEqual({
      id: 'screen-asset',
      name: 'Screen recording',
      expectedProjectPath: 'session-session-42/screen/segment.webm',
    });
  });

  it('updates role volumes and protects editable fields from destructive keyboard shortcuts', async () => {
    const mounted = mountEditor();
    editorState.store.systemVolume.value = 150;
    editorState.store.micVolume.value = 125;
    await mounted.vm.$nextTick();
    expect(
      editorState.store.compositionState.composition.value.clips.find((clip: any) => clip.role === 'system')?.volume,
    ).toBe(150);

    editorState.store.compositionState.selectedClipId.value = 'audio';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
    await mounted.vm.$nextTick();
    expect(editorState.store.compositionState.composition.value.clips).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'audio' })]),
    );

    const compositionAfterDelete = JSON.stringify(editorState.store.compositionState.composition.value);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
    await mounted.vm.$nextTick();
    expect(JSON.stringify(editorState.store.compositionState.composition.value)).toBe(compositionAfterDelete);
    input.remove();

    editorState.store.compositionState.selectedClipId.value = null;
    editorState.store.activeTab.value = 'zoom';
    editorState.store.zoomState.selectedZoom.value = { id: 'z', mode: 'manual' };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
    expect(editorState.store.zoomState.deleteSelectedZoom).toHaveBeenCalled();
  });
});
