import { mount, type VueWrapper } from '@vue/test-utils';
import { computed, defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { EditorPresetDocument, EditorPresetSettings } from '~/api/types/editor-preset';
import type { ElementEditorContext } from '../../elements/element-editor-types';
import { useVideoElements } from '../../elements/useVideoElements';
import { useEditorPresets } from '../useEditorPresets';
import { useProjectEditorState } from '../useProjectEditorState';
import { createState } from './editor-state-fixture';

const capture = vi.hoisted(() => ({
  getEditorPresets: vi.fn(),
  updateEditorPreset: vi.fn(),
  selectEditorPreset: vi.fn(),
  onEditorPresetsChanged: vi.fn(),
  saveProjectEditorState: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const wrappers: VueWrapper[] = [];
let saved: EditorPresetDocument;

function openEditor() {
  const state = createState();
  const selectedId = ref<string | null>(null);
  const selectedClip = computed(
    () => state.composition.value.clips.find((clip) => clip.id === selectedId.value) ?? null,
  );
  let elements!: ElementEditorContext;
  let presets!: ReturnType<typeof useEditorPresets>;
  let projectState!: ReturnType<typeof useProjectEditorState>;
  const wrapper = mount(
    defineComponent({
      setup() {
        elements = useVideoElements({
          composition: state.composition,
          editorDefaults: state.editorDefaults,
          selectedId,
          activeTab: ref('clip'),
          currentTime: ref(0),
          isPlaying: ref(false),
          select: (id) => {
            selectedId.value = id;
          },
          clearZoom: () => undefined,
        });
        presets = useEditorPresets(state.editorDefaults);
        projectState = useProjectEditorState({
          ...state,
          selectedClip,
          restoreComposition: (value: ClipComposition) => {
            state.composition.value = value;
          },
          restoreZoomElements: (value: ZoomElement[]) => {
            state.zoomElements.value = value;
          },
        });
        return () => null;
      },
    }),
  );
  wrappers.push(wrapper);
  return { state, selectedId, elements, presets, projectState, wrapper };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  const settings: EditorPresetSettings = {
    editor: { schemaVersion: 1 },
    devices: {},
    export: { format: 'mp4' },
    quickSnip: { automaticZoom: true },
  };
  saved = {
    schemaVersion: 1,
    activePresetId: 'default',
    presets: ['default', 'template'].map((id) => ({
      id,
      name: id,
      protected: id === 'default',
      updatedAt: '',
      settings: clone(settings),
    })),
  };
  capture.getEditorPresets.mockImplementation(async () => clone(saved));
  capture.onEditorPresetsChanged.mockReturnValue(() => undefined);
  capture.updateEditorPreset.mockImplementation(async (id: string, patch: Partial<EditorPresetSettings>) => {
    const preset = saved.presets.find((entry) => entry.id === id)!;
    preset.settings = { ...preset.settings, ...clone(patch) };
    return clone(saved);
  });
  capture.selectEditorPreset.mockImplementation(async (id: string) => {
    saved.activePresetId = id;
    return clone(saved);
  });
  capture.saveProjectEditorState.mockResolvedValue(undefined);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
});

describe('Default preferences across editor sessions', () => {
  it.each(['default', 'template'])(
    'keeps black shape text for the next recording after editing with %s',
    async (id) => {
      saved.activePresetId = id;
      const first = openEditor();
      await first.presets.load(true);
      first.elements.add('shape');
      first.elements.beginText(first.selectedId.value!);
      first.elements.updateText('Words from the old recording');
      const text = clone(first.elements.editing.value!.text!);
      text.style.color = '#000000';
      text.style.fontSize = 64;
      first.elements.update({ text });
      // Style preferences are independent of the inline text draft and selection.
      expect(first.state.editorDefaults.value.elementText?.style.color).toBe('#000000');
      first.selectedId.value = null;
      await nextTick();
      expect(capture.saveProjectEditorState).not.toHaveBeenCalled();
      await first.presets.flush();
      expect(saved.presets[0]!.settings.editor.elementText?.style.color).toBe('#000000');
      expect(saved.presets[1]!.settings.editor).toEqual({ schemaVersion: 1 });
      first.wrapper.unmount();

      saved.activePresetId = 'default';
      const second = openEditor();
      await second.presets.load(true);
      second.elements.add('shape');
      second.elements.beginText(second.selectedId.value!);
      second.elements.updateText('A new recording');
      second.elements.finishText();
      expect(second.elements.selected.value?.text).toMatchObject({
        content: 'A new recording',
        style: { color: '#000000', fontSize: 64 },
      });
      await second.presets.flush();
    },
  );

  it('does not replace preferences by merely opening an older saved project', async () => {
    const editor = openEditor();
    await editor.presets.load(true);
    editor.elements.add('text');
    editor.elements.finishText();
    await editor.presets.flush();
    await editor.projectState.saveNow();
    const oldState = clone(capture.saveProjectEditorState.mock.calls.at(-1)![1]);
    oldState.presentation.cursor.color = '#abcdef';
    const preferences = clone(saved.presets[0]!.settings.editor);
    capture.updateEditorPreset.mockClear();

    await editor.projectState.load('older-project', oldState);
    await nextTick();
    editor.projectState.enableDefaultCapture();
    expect(editor.state.cursorColor.value).toBe('#abcdef');
    expect(capture.updateEditorPreset).not.toHaveBeenCalled();
    expect(saved.presets[0]!.settings.editor).toEqual(preferences);
  });
});
