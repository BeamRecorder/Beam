import { effectScope, nextTick, shallowRef } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from './editor-state-fixture';
import type { ProjectEditorState } from '~/api/types/capture-api';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
const capture = vi.hoisted(() => ({ saveProjectEditorState: vi.fn(), getProjectEditorState: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
import { useProjectEditorState } from '../useProjectEditorState';

describe('project editor lifecycle', () => {
  it('observes immutable document replacement without walking all clips at setup', async () => {
    vi.useFakeTimers();
    capture.saveProjectEditorState.mockResolvedValue(undefined);
    const fixture = createState(),
      read = vi.fn(() => []);
    const document = {
      ...fixture.composition.value,
      get clips() {
        return read();
      },
    };
    const state = {
      ...fixture,
      composition: shallowRef(document),
      restoreComposition: vi.fn(),
      restoreZoomElements: vi.fn(),
    };
    const scope = effectScope();
    scope.run(() => useProjectEditorState(state));
    expect(read).not.toHaveBeenCalled();
    state.composition.value = { ...document };
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(capture.saveProjectEditorState).toHaveBeenCalledOnce();
    scope.stop();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('saves pending video edits on unmount when switching to a screenshot before the debounce runs', async () => {
    vi.useFakeTimers();
    capture.saveProjectEditorState.mockResolvedValue(undefined);
    const state = {
      ...createState(),
      restoreComposition: vi.fn(),
      restoreZoomElements: vi.fn(),
    };
    const scope = effectScope();
    scope.run(() => useProjectEditorState(state));
    state.backgroundBlurPercent.value = 42;
    await nextTick();
    expect(capture.saveProjectEditorState).not.toHaveBeenCalled();
    scope.stop();
    await flushPromises();
    expect(capture.saveProjectEditorState).toHaveBeenCalledWith(
      'project',
      expect.objectContaining({
        presentation: expect.objectContaining({ blurPercent: 42 }),
      }),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(capture.saveProjectEditorState).toHaveBeenCalledTimes(1);
  });

  it('cancels pending saves during a property gesture and remembers the final value once committed', async () => {
    vi.useFakeTimers();
    const state = { ...createState(), restoreComposition: vi.fn(), restoreZoomElements: vi.fn() };
    const scope = effectScope();
    const editor = scope.run(() => useProjectEditorState(state))!;
    state.backgroundBlurPercent.value = 20;
    await nextTick();
    beginPropertyInteraction();
    state.backgroundBlurPercent.value = 40;
    await editor.saveNow();
    await vi.advanceTimersByTimeAsync(300);
    expect(capture.saveProjectEditorState).not.toHaveBeenCalled();
    endPropertyInteraction();
    await vi.advanceTimersByTimeAsync(250);
    expect(state.editorDefaults.value.presentation?.blurPercent).toBe(40);
    expect(capture.saveProjectEditorState).toHaveBeenCalledOnce();
    scope.stop();
  });

  it.each(['debounce', 'dispose'])('reports a failed %s write without losing current preferences', async (leaving) => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    capture.saveProjectEditorState.mockRejectedValueOnce(new Error('disk full'));
    const state = { ...createState(), restoreComposition: vi.fn(), restoreZoomElements: vi.fn() };
    const scope = effectScope();
    scope.run(() => useProjectEditorState(state));
    state.backgroundBlurPercent.value = 55;
    await nextTick();
    if (leaving === 'dispose') scope.stop();
    else await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('failed to save'),
      ...(leaving === 'dispose'
        ? [expect.any(Error)]
        : [expect.objectContaining({ projectId: 'project' }), expect.any(Error)]),
    );
    expect(state.editorDefaults.value.presentation?.blurPercent).toBe(55);
    scope.stop();
    log.mockRestore();
  });

  it('ignores an obsolete project load and does not save while the new project is loading', async () => {
    const fixture = createState();
    const state = {
      ...fixture,
      restoreComposition: vi.fn(),
      restoreZoomElements: vi.fn(),
    };
    const scope = effectScope();
    const editor = scope.run(() => useProjectEditorState(state))!;
    let complete!: (value: ProjectEditorState) => void;
    capture.getProjectEditorState.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const oldLoad = editor.load('old');
    await editor.saveNow();
    expect(capture.saveProjectEditorState).not.toHaveBeenCalled();
    const initial: ProjectEditorState = {
      schemaVersion: 3,
      composition: fixture.composition.value,
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: fixture.canvas.value,
        selectedBackgroundId: null,
        background: null,
        importedBackgrounds: [],
        blurPercent: 42,
        cursor: createDefaultCursorPresentation(),
      },
    };
    await editor.load('new', initial);
    complete({ ...initial, presentation: { ...initial.presentation, blurPercent: 99 } });
    await oldLoad;
    expect(state.backgroundBlurPercent.value).toBe(42);
    expect(editor.loading.value).toBe(false);
    scope.stop();
  });

  it('suspends preference capture while fetching the next project and resumes it for user edits', async () => {
    const state = { ...createState(), restoreComposition: vi.fn(), restoreZoomElements: vi.fn() };
    const scope = effectScope();
    const editor = scope.run(() => useProjectEditorState(state))!;
    const original = JSON.parse(JSON.stringify(state.editorDefaults.value));
    editor.disableDefaultCapture();
    state.cursorColor.value = '#ffffff';
    await nextTick();
    expect(state.editorDefaults.value).toEqual(original);
    editor.enableDefaultCapture();
    state.cursorColor.value = '#000000';
    await nextTick();
    expect(state.editorDefaults.value.presentation?.cursor.color).toBe('#000000');
    scope.stop();
  });
});
