import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { SettingsEditorAction } from '~/api/types/hud-panel';
const mocks = vi.hoisted(() => ({
  capture: { toggleDevTools: vi.fn(), openRecorderFromEditor: vi.fn(), onSettingsEditorAction: vi.fn() },
  webcam: { add: vi.fn(), unavailable: { value: '' }, busy: { value: false }, error: { value: '' } },
  unsubscribe: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('./useFakeWebcamOverlay', () => ({ useFakeWebcamOverlay: () => mocks.webcam }));
vi.mock('../../composables/editor-defaults', () => ({ visualClipDefaultProps: () => ({ appearance: {} }) }));
vi.mock('../../workspace/workspace-context', () => ({
  useEditorWorkspaceContext: () => ({
    composition: ref({}),
    props: { project: { id: 'p' } },
    selectedClipId: ref(null),
    currentTime: ref(0),
    editorDefaults: ref({}),
    commitNow: vi.fn(),
    createEditorSnapshot: vi.fn(),
  }),
}));
import EditorSettingsActions from './EditorSettingsActions.vue';
enableAutoUnmount(afterEach);
let run: (action: SettingsEditorAction) => Promise<void>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.webcam.unavailable.value = '';
  mocks.webcam.error.value = '';
  mocks.capture.toggleDevTools.mockResolvedValue(undefined);
  mocks.capture.openRecorderFromEditor.mockResolvedValue(true);
  mocks.webcam.add.mockResolvedValue(undefined);
  mocks.capture.onSettingsEditorAction.mockImplementation((callback) => {
    run = callback;
    return mocks.unsubscribe;
  });
});
describe('editor-owned settings actions', () => {
  it('runs recorder and developer tools and releases its subscription on disposal', async () => {
    const w = mount(EditorSettingsActions);
    await run('recorder');
    await run('devtools');
    expect(mocks.capture.openRecorderFromEditor).toHaveBeenCalledOnce();
    expect(mocks.capture.toggleDevTools).toHaveBeenCalledOnce();
    w.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it('adds the webcam only when available and propagates its error', async () => {
    mount(EditorSettingsActions);
    await run('webcam');
    expect(mocks.webcam.add).toHaveBeenCalledOnce();
    mocks.webcam.unavailable.value = 'No visual clip';
    await expect(run('webcam')).rejects.toThrow('No visual clip');
    expect(mocks.webcam.add).toHaveBeenCalledOnce();
    mocks.webcam.unavailable.value = '';
    mocks.webcam.error.value = 'Cannot add webcam';
    await expect(run('webcam')).rejects.toThrow('Cannot add webcam');
  });
  it('reports recorder failures through the native request response', async () => {
    mount(EditorSettingsActions);
    mocks.capture.openRecorderFromEditor.mockResolvedValueOnce(false);
    await expect(run('recorder')).rejects.toThrow();
    mocks.capture.toggleDevTools.mockRejectedValueOnce(new Error('No tools'));
    await expect(run('devtools')).rejects.toThrow('No tools');
    await flushPromises();
  });
});
