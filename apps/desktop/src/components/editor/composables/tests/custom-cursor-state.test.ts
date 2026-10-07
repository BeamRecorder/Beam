import { effectScope, nextTick } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectEditorState } from '~/api/types/capture-api';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { emptyComposition } from '@beam/engine/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { useProjectEditorState } from '../useProjectEditorState';
import { createState } from './editor-state-fixture';
const capture = vi.hoisted(() => ({
  getProjectEditorState: vi.fn(),
  saveProjectEditorState: vi.fn(async (_id: string, _state: ProjectEditorState) => {}),
}));
vi.mock('~/api/capture', () => ({ capture }));
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
beforeEach(() => vi.clearAllMocks());
const state = (isFresh: boolean, enabled: boolean): ProjectEditorState => ({
  schemaVersion: 3,
  isFresh,
  composition: emptyComposition(),
  zoom: { elements: [], generatedSessions: [] },
  presentation: {
    canvas: { ...DEFAULT_OUTPUT_CANVAS },
    selectedBackgroundId: null,
    background: null,
    importedBackgrounds: [],
    blurPercent: 0,
    cursor: { ...createDefaultCursorPresentation(), enabled },
  },
});
const harness = (embedded: boolean) => {
  const refs = createState();
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() =>
    useProjectEditorState({
      ...refs,
      nativeCursorEmbedded: () => embedded,
      restoreComposition: (value) => {
        refs.composition.value = value;
      },
      restoreZoomElements: (value) => {
        refs.zoomElements.value = value;
      },
    }),
  )!;
  return { refs, controller };
};
it('turns the custom cursor off for a fresh recording containing the real cursor', async () => {
  const h = harness(true);
  h.refs.editorDefaults.value.presentation = state(false, true).presentation;
  await h.controller.load('project', state(true, true));
  expect(h.refs.cursorEnabled.value).toBe(false);
  await h.controller.saveNow(false);
  expect(capture.saveProjectEditorState.mock.calls[0]?.[1].presentation.cursor.enabled).toBe(false);
  expect(h.refs.editorDefaults.value.presentation?.cursor.enabled).toBe(true);
});
it('retains the normal cursor default on recordings without the system cursor', async () => {
  const h = harness(false);
  await h.controller.load('project', state(true, true));
  expect(h.refs.cursorEnabled.value).toBe(true);
});
it.each([false, true])('retains manual overlay choice %s when reopening a native-cursor recording', async (enabled) => {
  const h = harness(true);
  await h.controller.load('project', state(false, enabled));
  expect(h.refs.cursorEnabled.value).toBe(enabled);
});
it('saves toggles and global cursor defaults after the user opts into an overlay', async () => {
  const h = harness(true);
  await h.controller.load('project', state(true, true));
  h.controller.enableDefaultCapture();
  h.refs.cursorEnabled.value = true;
  await nextTick();
  await h.controller.saveNow();
  expect(capture.saveProjectEditorState.mock.calls.at(-1)?.[1].presentation.cursor.enabled).toBe(true);
  expect(h.refs.editorDefaults.value.presentation?.cursor.enabled).toBe(true);
});

it.each([false, true])(
  'applies the embedded-cursor default only once, then saves and reloads choice %s',
  async (enabled) => {
    const first = harness(true);
    // An enabled preset must not add a second cursor on initial opening.
    first.refs.editorDefaults.value.presentation = state(false, true).presentation;
    await first.controller.load('project', state(true, true));
    expect(first.refs.cursorEnabled.value).toBe(false);
    first.controller.enableDefaultCapture();
    first.refs.cursorEnabled.value = enabled;
    await nextTick();
    await first.controller.saveNow(false);
    const saved = capture.saveProjectEditorState.mock.calls.at(-1)![1];
    expect(saved.presentation.cursor.enabled).toBe(enabled);
    const reopened = harness(true);
    await reopened.controller.load('project', { ...saved, isFresh: false });
    expect(reopened.refs.cursorEnabled.value).toBe(enabled);
  },
);
