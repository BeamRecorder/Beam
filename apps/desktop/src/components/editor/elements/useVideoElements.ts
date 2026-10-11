import { watch } from 'vue';
import type { Ref } from 'vue';
import { isShapeClip, type ClipComposition } from '@beam/engine/shared/composition-types';
import { addClip, deleteClip, setShapeLayerStyle, setTransform } from '@beam/engine/commands/clip-engine';
import { provideElementEditor } from './useElementEditor';
import type { EditorPreferenceDefaults } from '../composables/editor-default-types';
import { normalizeElementTextDefaults } from './element-text-defaults';

export function useVideoElements(options: {
  composition: Ref<ClipComposition>;
  editorDefaults: Ref<EditorPreferenceDefaults>;
  selectedId: Ref<string | null>;
  activeTab: Ref<string>;
  canvasSize?: () => { width: number; height: number };
  currentTime: Ref<number>;
  isPlaying: Ref<boolean>;
  select: (id: string) => void;
  clearZoom: () => void;
  addHighlight?: () => void | Promise<void>;
  addBlur?: () => void | Promise<void>;
  addColor?: () => void | Promise<void>;
  addImage?: () => void | Promise<void>;
}) {
  const editor = provideElementEditor({
    textDefaults: () => options.editorDefaults.value.elementText,
    rememberTextStyle: (text) => {
      const elementText = normalizeElementTextDefaults(text);
      if (elementText) options.editorDefaults.value = { ...options.editorDefaults.value, elementText };
    },
    canvasSize: options.canvasSize,
    addImage: options.addImage,
    addHighlight: options.addHighlight,
    addBlur: options.addBlur,
    addColor: options.addColor,
    layers: () => options.composition.value.clips.filter(isShapeClip),
    selectedId: () => options.selectedId.value,
    select: (id) => {
      options.clearZoom();
      options.select(id);
      options.activeTab.value = 'clip';
    },
    insert: (clip) => {
      options.composition.value = addClip(options.composition.value, {
        ...clip,
        order: Math.min(0, ...options.composition.value.clips.map((c) => c.order)) - 1,
      });
    },
    update: (id, patch) => {
      const { transform, ...style } = patch;
      const composition = transform
        ? setTransform(options.composition.value, id, transform)
        : options.composition.value;
      options.composition.value = setShapeLayerStyle(composition, id, style);
    },
    remove: (id) => {
      options.composition.value = deleteClip(options.composition.value, id);
    },
    timing: () => ({
      startMs: Math.round(options.currentTime.value * 1000),
      durationMs: 3000,
    }),
    canInteract: () =>
      !options.isPlaying.value &&
      !options.composition.value.clips.find((clip) => clip.id === options.selectedId.value)?.locked,
  });
  watch(options.activeTab, (tab) => {
    if (tab !== 'clip') {
      editor.drawingMode.value = false;
      editor.finishVector();
    }
  });
  return editor;
}
