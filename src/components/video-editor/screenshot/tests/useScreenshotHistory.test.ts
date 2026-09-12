import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import { createElementText } from '~/media/shared/element-text';
import { useEditorUndoRedo } from '../../composables/useEditorUndoRedo';
import {
  endPropertyInteraction,
  resetPropertyInteractions,
  beginPropertyInteraction,
} from '~/composables/property-interaction';
import { useScreenshotHistory } from '../useScreenshotHistory';
import { screenshotShape, screenshotState } from '../screenshot-state';
import { SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID } from '../screenshot-layers';

const documentFixture = (): ScreenshotDocument => ({
  id: 'screenshot-history-fixture',
  name: 'History fixture',
  width: 1600,
  height: 900,
  source: 'project-media://screenshot/history/source.png',
  preset: {
    editor: { schemaVersion: 1 },
    devices: {},
    export: { format: 'png', resolution: '1080p' },
    quickSnip: { automaticZoom: false },
  } satisfies EditorPresetSettings,
  state: null,
});

const createState = (revision: number): ScreenshotState => {
  const state = screenshotState(documentFixture());
  state.canvas.preset = 'custom';
  state.canvas.width = 1600 + revision;
  state.canvas.height = 900 + revision;
  state.canvas.showBackground = revision % 2 === 0;
  state.canvas.watermark = {
    ...state.canvas.watermark!,
    enabled: true,
    text: 'custom',
    customText: `watermark-${revision}`,
  };
  state.background = {
    id: `color:${revision}`,
    name: `Background ${revision}`,
    kind: 'color',
    color: revision % 2 ? '#123456' : '#654321',
  };
  state.blurPercent = 12 + revision;
  state.image.transform = { x: revision / 100, y: 0.1, width: 0.8, height: 0.7 };
  state.image.appearance.shadowBlur = 18 + revision;
  state.image.isMirrored = revision % 2 === 1;
  const shape = screenshotShape('rounded-rectangle', `shape-${revision}`);
  shape.text = createElementText(`Element text ${revision}`);
  shape.fillColor = revision % 2 ? '#ff0000' : '#00ff00';
  state.shapes = [shape];
  state.cursors = [
    {
      id: `cursor-${revision}`,
      name: `Cursor ${revision}`,
      enabled: true,
      position: { x: 0.2 + revision / 100, y: 0.3 },
      size: 1 + revision,
      rotation: 5 + revision,
      selection: { packId: 'pack:test', mode: 'fixed', cursorId: 'pointer' },
      color: '#abcdef',
      shadowEnabled: true,
      shadowBlur: 4 + revision,
      shadowColor: '#000000',
      shadowDirection: 'bottom',
    },
  ];
  state.composition = [
    { id: SCREENSHOT_BACKGROUND_ID, opacity: 75 + revision, blendMode: 'multiply', locked: false },
    { id: state.image.id, opacity: 90, blendMode: 'screen', locked: revision % 2 === 0 },
    { id: shape.id, opacity: 80, blendMode: 'overlay', locked: false },
    { id: state.cursors[0]!.id, opacity: 65, blendMode: 'difference', locked: false },
    { id: SCREENSHOT_WATERMARK_ID, opacity: 100, blendMode: 'source-over', locked: true },
  ];
  state.format = revision % 2 ? 'webp' : 'png';
  state.quality = 0.75 + revision / 100;
  return state;
};

interface MountedHistory {
  api: ReturnType<typeof useEditorUndoRedo<ScreenshotState>>;
  state: Ref<ScreenshotState | null>;
  wrapper: VueWrapper;
  restore: ReturnType<typeof vi.fn>;
}

const wrappers: VueWrapper[] = [];

const mountHistory = (initial: ScreenshotState): MountedHistory => {
  const state = ref<ScreenshotState | null>(structuredClone(initial));
  const restore = vi.fn();
  let api!: MountedHistory['api'];
  const Host = defineComponent({
    setup() {
      api = useScreenshotHistory(state, { disabled: () => false, restore });
      api.initialize(state.value!);
      return () => null;
    },
  });
  const wrapper = mount(Host);
  wrappers.push(wrapper);
  return { api, state, wrapper, restore };
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  resetPropertyInteractions();
  vi.useRealTimers();
});

describe('useScreenshotHistory', () => {
  it('persists every screenshot state category and rehydrates undo and redo', async () => {
    const initial = createState(0);
    const first = mountHistory(initial);
    const edited = createState(1);
    first.state.value = edited;
    await nextTick();
    expect(first.api.undoStack.value).toHaveLength(2);

    const history = first.api.serialize();
    expect(history.undo[0]).toEqual(initial);
    expect(history.undo[1]).toEqual(edited);

    const reopened = mountHistory(edited);
    reopened.api.initialize(reopened.state.value!, history);
    expect(reopened.api.canUndo.value).toBe(true);
    await reopened.api.undo();
    expect(reopened.state.value).toEqual(initial);
    expect(reopened.restore).toHaveBeenCalledOnce();
    await reopened.api.redo();
    expect(reopened.state.value).toEqual(edited);
    expect(reopened.restore).toHaveBeenCalledTimes(2);
  });

  it('records one complete snapshot for a property gesture even when updates pause', async () => {
    vi.useFakeTimers();
    const initial = createState(0);
    const { api, state } = mountHistory(initial);
    beginPropertyInteraction();
    state.value!.blurPercent = 30;
    await nextTick();
    await vi.advanceTimersByTimeAsync(1_000);
    state.value!.quality = 0.88;
    state.value!.shapes[0]!.transform.x = 0.6;
    await nextTick();
    await vi.advanceTimersByTimeAsync(1_000);
    state.value!.background!.name = 'Changed during the same drag';
    await nextTick();

    expect(api.undoStack.value).toHaveLength(1);
    endPropertyInteraction();
    await nextTick();

    expect(api.undoStack.value).toHaveLength(2);
    expect(api.undoStack.value[1]).toEqual(state.value);
    await api.undo();
    expect(state.value).toEqual(initial);
  });

  it('clears the redo branch when a new screenshot edit follows undo', async () => {
    const { api, state } = mountHistory(createState(0));
    state.value = createState(1);
    await nextTick();
    await api.undo();
    expect(api.canRedo.value).toBe(true);

    state.value!.quality = 0.99;
    await nextTick();

    expect(api.canRedo.value).toBe(false);
    expect(api.serialize().redo).toEqual([]);
    expect(api.serialize().undo.at(-1)?.quality).toBe(0.99);
  });
});
