import { computed, watch } from 'vue';
import type { Ref } from 'vue';
import { isShapeClip, type ClipComposition } from '~/media/shared/composition-types';
import { addClip, deleteClip, setShapeLayerStyle } from '../composition/engine/clip-engine';
import { provideElementEditor } from './useElementEditor';
import { isVideoElementClip } from './video-elements';

export function useVideoElements(options: {
  composition: Ref<ClipComposition>;
  selectedId: Ref<string | null>;
  activeTab: Ref<string>;
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
    addImage: options.addImage,
    addHighlight: options.addHighlight,
    addBlur: options.addBlur,
    addColor: options.addColor,
    layers: () => options.composition.value.clips.filter(isShapeClip),
    selectedId: () => options.selectedId.value,
    select: (id) => {
      options.clearZoom();
      options.select(id);
      options.activeTab.value = 'elements';
    },
    insert: (clip) => {
      options.composition.value = addClip(options.composition.value, {
        ...clip,
        order: Math.min(0, ...options.composition.value.clips.map((c) => c.order)) - 1,
      });
    },
    update: (id, patch) => {
      options.composition.value = setShapeLayerStyle(options.composition.value, id, patch);
    },
    remove: (id) => {
      options.composition.value = deleteClip(options.composition.value, id);
    },
    timing: () => ({ startMs: Math.round(options.currentTime.value * 1000), durationMs: 3000 }),
    canInteract: () =>
      !options.isPlaying.value &&
      !options.composition.value.clips.find((clip) => clip.id === options.selectedId.value)?.locked,
  });
  const selectedIsElement = computed(() =>
    isVideoElementClip(options.composition.value.clips.find((item) => item.id === options.selectedId.value)),
  );
  watch(
    [selectedIsElement, options.activeTab],
    () => {
      if (options.activeTab.value === 'clip' && selectedIsElement.value) options.activeTab.value = 'elements';
    },
    { flush: 'sync', immediate: true },
  );
  watch(options.activeTab, (tab) => {
    if (tab !== 'elements') editor.drawingMode.value = false;
  });
  return editor;
}
