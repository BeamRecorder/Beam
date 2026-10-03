import { effectScope, nextTick, shallowRef } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from './editor-state-fixture';
const capture = vi.hoisted(() => ({ saveProjectEditorState: vi.fn() }));
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
});
