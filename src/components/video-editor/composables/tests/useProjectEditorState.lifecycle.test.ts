import { effectScope, nextTick } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from './editor-state-fixture';
const capture = vi.hoisted(() => ({ saveProjectEditorState: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
import { useProjectEditorState } from '../useProjectEditorState';

describe('project editor lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('saves pending video edits on unmount when switching to a screenshot before the debounce runs', async () => {
    vi.useFakeTimers();
    capture.saveProjectEditorState.mockResolvedValue(undefined);
    const state = createState();
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
