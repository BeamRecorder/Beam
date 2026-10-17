import { effectScope, nextTick, shallowRef, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from './editor-state-fixture';
import type { ProjectEditorState } from '~/api/types/capture-api';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '@beam/engine/zoom/zoom-types';
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
  it('retains immutable compositions and captures every queued save before later edits', async () => {
    const state = { ...createState(), restoreComposition: vi.fn(), restoreZoomElements: vi.fn() };
    const scope = effectScope();
    const editor = scope.run(() => useProjectEditorState(state))!;
    let finish!: () => void;
    capture.saveProjectEditorState.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    capture.saveProjectEditorState.mockResolvedValue(undefined);
    const firstDocument = { ...state.composition.value, durationMs: 1000 };
    state.composition.value = firstDocument;
    const first = editor.saveNow();
    await flushPromises();
    const firstSaved = capture.saveProjectEditorState.mock.calls[0]![1] as ProjectEditorState;
    expect(firstSaved.composition).toBe(firstDocument);
    expect(Object.isFrozen(firstDocument.clips)).toBe(true);
    state.composition.value = { ...firstDocument, durationMs: 2000 };
    state.canvas.value = {
      ...state.canvas.value,
      watermark: { ...state.canvas.value.watermark!, customText: 'second' },
    };
    const second = editor.saveNow();
    state.composition.value = { ...state.composition.value, durationMs: 3000 };
    state.canvas.value.watermark!.customText = 'third';
    finish();
    await first;
    await second;
    const secondSaved = capture.saveProjectEditorState.mock.calls[1]![1] as ProjectEditorState;
    expect(firstSaved.composition.durationMs).toBe(1000);
    expect(firstSaved.presentation.canvas.watermark!.customText).toBe('');
    expect(secondSaved.composition.durationMs).toBe(2000);
    expect(secondSaved.presentation.canvas.watermark!.customText).toBe('second');
    scope.stop();
    await flushPromises();
  });
  it('does not walk or serialize an already owned document on subsequent property saves', async () => {
    const fixture = createState(),
      read = vi.fn(() => []);
    const doc = {
      ...fixture.composition.value,
      get clips() {
        return read();
      },
    };
    const state = {
      ...fixture,
      composition: shallowRef(doc),
      restoreComposition: vi.fn(),
      restoreZoomElements: vi.fn(),
    };
    const scope = effectScope(),
      editor = scope.run(() => useProjectEditorState(state))!;
    await editor.saveNow();
    expect(read).toHaveBeenCalled();
    read.mockClear();
    state.backgroundBlurPercent.value = 25;
    await editor.saveNow();
    expect(read).not.toHaveBeenCalled();
    expect(capture.saveProjectEditorState.mock.calls[1]![1].composition).toBe(doc);
    scope.stop();
    await flushPromises();
  });

  it('resolves a late background by its saved path while preserving a current user selection', async () => {
    const state = { ...createState(), restoreComposition: vi.fn(), restoreZoomElements: vi.fn() };
    const scope = effectScope(),
      editor = scope.run(() => useProjectEditorState(state))!;
    const initial: ProjectEditorState = {
      schemaVersion: 3,
      composition: state.composition.value,
      zoom: { elements: [], generatedSessions: [] },
      presentation: {
        canvas: state.canvas.value,
        selectedBackgroundId: '/custom.jpg',
        background: null,
        importedBackgrounds: [],
        blurPercent: 0,
        cursor: createDefaultCursorPresentation(),
      },
    };
    await editor.load('project', initial);
    state.availableBackgrounds.value = [
      { items: [{ id: 'unrelated', path: '/other.jpg', name: 'Other', extension: 'jpg', kind: 'image' }] },
    ];
    await nextTick();
    expect(state.selectedBackground.value).toBeNull();
    const background = { id: 'custom', path: '/custom.jpg', name: 'Custom', extension: 'jpg', kind: 'image' as const };
    state.availableBackgrounds.value = [{ items: [background] }];
    await nextTick();
    expect(state.selectedBackground.value?.id).toBe('custom');
    state.availableBackgrounds.value = [];
    await nextTick();
    expect(state.selectedBackground.value?.id).toBe('custom');
    scope.stop();
    await flushPromises();
  });
  it('keeps the captured native cursor as the sole cursor for a fresh project with explicit follow settings', async () => {
    const fixture = createState(),
      follow = ref({ ...DEFAULT_ZOOM_AUTO_FOLLOW });
    const state = {
      ...fixture,
      zoomAutoFollow: follow,
      nativeCursorEmbedded: () => true,
      restoreComposition: vi.fn(),
      restoreZoomElements: vi.fn(),
    };
    const scope = effectScope(),
      editor = scope.run(() => useProjectEditorState(state))!;
    await editor.load('project', {
      schemaVersion: 3,
      isFresh: true,
      composition: state.composition.value,
      zoom: { elements: [], generatedSessions: [], autoFollow: { ...DEFAULT_ZOOM_AUTO_FOLLOW } },
      presentation: {
        canvas: state.canvas.value,
        selectedBackgroundId: null,
        background: null,
        importedBackgrounds: [],
        blurPercent: 0,
        cursor: createDefaultCursorPresentation(),
      },
    });
    expect(state.cursorEnabled.value).toBe(false);
    expect(follow.value).toEqual(DEFAULT_ZOOM_AUTO_FOLLOW);
    scope.stop();
    await flushPromises();
  });
});
