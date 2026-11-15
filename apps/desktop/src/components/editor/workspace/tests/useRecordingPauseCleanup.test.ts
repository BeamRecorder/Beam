import type { EditorStateSnapshot } from '../../composables/editor-history-types';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { useEditorUndoRedo } from '../../composables/useEditorUndoRedo';
import { createEditorHistorySnapshots } from '../../composables/editor-history-snapshots';
import { useToastStore } from '~/ui/toast/toastStore';
import { useRecordingPauseCleanup } from '../useRecordingPauseCleanup';

function recorded() {
  const clips: VisualClip[] = [0, 601000].map((timelineStartMs, index) => ({
    id: `clip-${index}`,
    kind: 'screen',
    name: 'Recording',
    trackId: 'screen',
    assetId: `asset-${index}`,
    timelineStartMs,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    order: index,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    isMirrored: false,
    isMirroredY: false,
    appearance: createDefaultClipAppearance('screen'),
  }));
  const assets: MediaAsset[] = clips.map((clip) => ({
    id: clip.assetId,
    kind: 'video',
    name: 'Recording',
    fileName: null,
    width: 1920,
    height: 1080,
    durationMs: 1000,
    src: '/recording.mp4',
    origin: 'session',
    sessionId: 'session',
  }));
  return createComposition(assets, clips);
}
const wrappers: ReturnType<typeof mount>[] = [];
function fixture() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const toast = useToastStore();
  const composition = ref(recorded());
  const zoomElements = ref<ZoomElement[]>([]);
  const ready = ref(false),
    fresh = ref(true),
    presented = ref(false),
    project = ref<string | null>('project');
  const session = ref<string | null>('session');
  const save = vi.fn();
  const snapshots = createEditorHistorySnapshots();
  const snapshot = () =>
    snapshots.capture({
      composition: composition.value,
      zoomElements: zoomElements.value,
      outputCanvas: DEFAULT_OUTPUT_CANVAS,
      selectedBackground: null,
      backgroundBlurPercent: 0,
    });
  let history!: ReturnType<typeof useEditorUndoRedo<EditorStateSnapshot>>;
  const wrapper = mount(
    defineComponent({
      setup() {
        history = useEditorUndoRedo<EditorStateSnapshot>({
          immutable: true,
          onRestoreSnapshot: async (value) => {
            composition.value = value.composition;
            zoomElements.value = value.zoomElements;
          },
        });
        useRecordingPauseCleanup({
          composition,
          zoomElements,
          ready: () => ready.value,
          fresh: () => fresh.value,
          projectId: () => project.value,
          sessionId: () => session.value,
          presented: () => presented.value,
          snapshot,
          commit: history.commitNow,
          undo: history.undo,
          save,
        });
        return () => null;
      },
    }),
    { global: { plugins: [pinia] } },
  );
  wrappers.push(wrapper);
  return { composition, ready, fresh, presented, project, session, save, history, toast, wrapper };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('automatic pause cleanup through the generic toast service', () => {
  it('removes pauses before presenting feedback and keeps one undoable edit', async () => {
    const f = fixture();
    f.ready.value = true;
    await nextTick();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(1000);
    expect(f.history.undoStack.value).toHaveLength(2);
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.toast.toasts).toHaveLength(0);
    f.presented.value = true;
    await nextTick();
    expect(f.toast.toasts).toHaveLength(1);
    expect(f.toast.toasts[0]).toMatchObject({ duration: 5000, type: 'info', action: { label: 'Restore' } });
    await f.toast.toasts[0]!.action!.onClick?.();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(601000);
    expect(f.toast.toasts).toHaveLength(0);
    await f.history.redo();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(1000);
    expect(f.toast.toasts).toHaveLength(0);
  });
  it('lets the shared service expire feedback after five seconds while Undo remains available', async () => {
    const f = fixture();
    f.ready.value = f.presented.value = true;
    await nextTick();
    vi.advanceTimersByTime(4999);
    expect(f.toast.toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.toast.toasts).toHaveLength(0);
    expect(f.history.canUndo.value).toBe(true);
    await f.history.undo();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(601000);
  });
  it.each(['saved', 'uninterrupted', 'missing-project', 'missing-session'] as const)(
    'leaves %s projects alone',
    async (mode) => {
      const f = fixture();
      if (mode === 'saved') f.fresh.value = false;
      if (mode === 'uninterrupted') f.composition.value = createComposition([], []);
      if (mode === 'missing-project') f.project.value = null;
      if (mode === 'missing-session') f.session.value = null;
      const original = f.composition.value;
      f.ready.value = f.presented.value = true;
      await nextTick();
      expect(f.composition.value).toBe(original);
      expect(f.toast.toasts).toHaveLength(0);
      expect(f.save).not.toHaveBeenCalled();
    },
  );
  it('never repeats cleanup after Restore or a repeated readiness notification', async () => {
    const f = fixture();
    f.ready.value = f.presented.value = true;
    await nextTick();
    await f.history.undo();
    f.ready.value = false;
    await nextTick();
    f.ready.value = true;
    await nextTick();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(601000);
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.toast.toasts).toHaveLength(0);
  });
  it('withdraws the shortcut when later edits make undoing the cleanup unsafe', async () => {
    const f = fixture();
    f.ready.value = f.presented.value = true;
    await nextTick();
    const action = f.toast.toasts[0]!.action!;
    f.composition.value = {
      ...f.composition.value,
      clips: f.composition.value.clips.map((clip) => ({ ...clip, name: 'User edit' })),
    };
    await nextTick();
    expect(f.toast.toasts).toHaveLength(0);
    await action.onClick?.();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(1000);
    expect(f.composition.value.clips[1]?.name).toBe('User edit');
  });
  it('prevents an old toast from undoing a different project cleanup', async () => {
    const f = fixture();
    f.ready.value = f.presented.value = true;
    await nextTick();
    const action = f.toast.toasts[0]!.action!;
    f.ready.value = false;
    f.project.value = 'other-project';
    f.composition.value = recorded();
    await nextTick();
    f.ready.value = true;
    await nextTick();
    await action.onClick?.();
    expect(f.composition.value.clips[1]?.timelineStartMs).toBe(1000);
  });
  it('removes its notification on disposal', async () => {
    const f = fixture();
    f.ready.value = f.presented.value = true;
    await nextTick();
    f.wrapper.unmount();
    expect(f.toast.toasts).toHaveLength(0);
  });
  it('waits for a visible editor before starting the shared five-second timer', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const f = fixture();
    f.ready.value = f.presented.value = true;
    await nextTick();
    vi.advanceTimersByTime(10000);
    expect(f.toast.toasts).toHaveLength(0);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(f.toast.toasts).toHaveLength(1);
    vi.advanceTimersByTime(4999);
    expect(f.toast.toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(f.toast.toasts).toHaveLength(0);
  });
});
