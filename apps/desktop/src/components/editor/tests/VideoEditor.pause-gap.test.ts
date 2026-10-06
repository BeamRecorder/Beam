import './VideoEditor.test.setup';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { timelineGaps } from '@beam/engine/composition/timeline-gaps';
import type { AudioClip, VisualClip } from '@beam/engine/shared/composition-types';
import type { EditorWorkspaceContext } from '../workspace/workspace-types';
import { historyState, mountEditor, setEditorComponent } from './VideoEditor.test.setup';

const { default: VideoEditor } = await import('../VideoEditor.vue');
setEditorComponent(VideoEditor);
const workspaceOf = (mounted: VueWrapper) =>
  (mounted.findComponent({ name: 'VideoEditorPreview' }).vm as unknown as { workspace: EditorWorkspaceContext })
    .workspace;

const preparePause = async () => {
  const mounted = mountEditor();
  const workspace = workspaceOf(mounted);
  const screen = workspace.composition.value.clips.find((clip): clip is VisualClip => clip.kind === 'screen')!;
  const mic = workspace.composition.value.clips.find((clip): clip is AudioClip => clip.kind === 'audio')!;
  const before: VisualClip = { ...screen, id: 'screen-before', timelineDurationMs: 2005, sourceDurationMs: 2005 };
  const after: VisualClip = { ...screen, id: 'screen-after', timelineStartMs: 5000 };
  const cameraBefore: VisualClip = {
    ...screen,
    id: 'camera-before',
    kind: 'webcam',
    trackId: 'camera',
    order: 2,
    recordingClipId: before.id,
  };
  const cameraAfter: VisualClip = {
    ...cameraBefore,
    id: 'camera-after',
    timelineStartMs: 5015,
    recordingClipId: after.id,
  };
  workspace.composition.value = createComposition(
    workspace.composition.value.assets.map((asset) => ({ ...asset, durationMs: 10_000, sessionId: 'recording' })),
    [
      before,
      after,
      cameraBefore,
      cameraAfter,
      {
        ...mic,
        id: 'mic-before',
        role: 'microphone',
        timelineDurationMs: 2010,
        sourceDurationMs: 2010,
        recordingClipId: before.id,
      },
      { ...mic, id: 'mic-after', role: 'microphone', timelineStartMs: 5003, recordingClipId: after.id },
    ],
  );
  workspace.zoomElements.value = [
    {
      id: 'auto-after',
      sessionId: 'recording',
      startMs: 5030,
      endMs: 5530,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'auto',
      linkedClipId: after.id,
    },
    {
      id: 'manual-after',
      sessionId: 'recording',
      startMs: 6000,
      endMs: 6500,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 2,
      mode: 'manual',
    },
  ];
  await nextTick();
  historyState.commitNow.mockClear();
  vi.mocked(workspace.editorState.scheduleSave).mockClear();
  const gap = timelineGaps(workspace.composition.value.clips.filter((clip) => clip.kind === 'webcam'))[0]!;
  return { mounted, workspace, gap };
};

describe('VideoEditor pause removal', () => {
  it('applies the shared pause duration to media and zooms, saves once and supports undo/redo', async () => {
    const { mounted, workspace, gap } = await preparePause();
    const before = JSON.stringify({ composition: workspace.composition.value, zooms: workspace.zoomElements.value });
    mounted.findComponent({ name: 'MockEditorTimeline' }).vm.$emit('remove:gap', gap);
    await nextTick();
    expect(workspace.composition.value.clips.find((clip) => clip.id === 'screen-after')?.timelineStartMs).toBe(2010);
    expect(workspace.composition.value.clips.find((clip) => clip.id === 'camera-after')?.timelineStartMs).toBe(2025);
    expect(workspace.composition.value.clips.find((clip) => clip.id === 'mic-after')?.timelineStartMs).toBe(2013);
    expect(workspace.zoomElements.value.map(({ id, startMs, endMs }) => ({ id, startMs, endMs }))).toEqual([
      { id: 'auto-after', startMs: 2040, endMs: 2540 },
      { id: 'manual-after', startMs: 3010, endMs: 3510 },
    ]);
    expect(workspace.editorState.scheduleSave).toHaveBeenCalledOnce();
    expect(historyState.commitNow).toHaveBeenCalledTimes(2);
    const joined = JSON.stringify({ composition: workspace.composition.value, zooms: workspace.zoomElements.value });
    await workspace.undo();
    expect(JSON.stringify({ composition: workspace.composition.value, zooms: workspace.zoomElements.value })).toBe(
      before,
    );
    await workspace.redo();
    expect(JSON.stringify({ composition: workspace.composition.value, zooms: workspace.zoomElements.value })).toBe(
      joined,
    );
  });

  it('leaves media, history and saves unchanged when a linked downstream microphone is locked', async () => {
    const { workspace, gap } = await preparePause();
    workspace.composition.value = {
      ...workspace.composition.value,
      clips: workspace.composition.value.clips.map((clip) =>
        clip.id === 'mic-after' ? { ...clip, locked: true } : clip,
      ),
    };
    const before = workspace.composition.value;
    const zooms = workspace.zoomElements.value;
    workspace.closeTimelineGap(gap);
    expect(workspace.composition.value).toBe(before);
    expect(workspace.zoomElements.value).toBe(zooms);
    expect(historyState.commitNow).not.toHaveBeenCalled();
    expect(workspace.editorState.scheduleSave).not.toHaveBeenCalled();
  });

  it('rejects a stale gap instead of removing a second interval after the first removal', async () => {
    const { workspace, gap } = await preparePause();
    workspace.closeTimelineGap(gap);
    const joined = workspace.composition.value;
    const zooms = workspace.zoomElements.value;
    historyState.commitNow.mockClear();
    vi.mocked(workspace.editorState.scheduleSave).mockClear();
    workspace.closeTimelineGap(gap);
    expect(workspace.composition.value).toBe(joined);
    expect(workspace.zoomElements.value).toBe(zooms);
    expect(historyState.commitNow).not.toHaveBeenCalled();
    expect(workspace.editorState.scheduleSave).not.toHaveBeenCalled();
  });
});
