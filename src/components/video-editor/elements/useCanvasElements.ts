import { loadElementFonts } from '~/media/shared/element-fonts';
import { useToastStore } from '~/ui/toast/toastStore';
import { computed, watch } from 'vue';
import type { ElementViewport } from './element-editor-types';
import type { VideoWindowBounds } from '../canvas/composables/useCameraZoom';
import { useElementEditor } from './useElementEditor';

export function useCanvasElements(options: {
  bounds: () => VideoWindowBounds | null;
  preview: () => ElementViewport;
  clipIdAt: (event: MouseEvent) => string | null;
  canEdit: () => boolean;
  render: () => void;
}) {
  const editor = useElementEditor();
  if (editor) {
    const toast = useToastStore();
    watch(
      () => editor?.layers.value.map((c) => c.text?.style.fontAssetId),
      async () => {
        try {
          await loadElementFonts(editor?.layers.value ?? []);
          options.render();
        } catch (error) {
          toast.error(String(error));
        }
      },
      { immediate: true },
    );
  }
  const viewport = computed(() => {
    const bounds = options.bounds();
    return bounds ? { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh } : options.preview();
  });
  const editingId = computed(() => editor?.editing.value?.id ?? null);
  watch(editingId, options.render);
  watch(options.canEdit, (allowed) => {
    if (!allowed && editor) {
      editor.finishText();
      editor.drawingMode.value = false;
    }
  });
  return {
    editor,
    viewport,
    editingId,
    begin: (event: MouseEvent) => {
      if (event.button !== 0 || !options.canEdit()) return false;
      const id = options.clipIdAt(event);
      return Boolean(id && editor?.beginText(id));
    },
  };
}
