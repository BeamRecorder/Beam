import { projectFontSource } from '~/api/project-font-source';
import { loadElementFonts } from '@beam/runtime/shared/element-font-loader';
import { useToastStore } from '~/ui/toast/toastStore';
import { computed, watch } from 'vue';
import type { ElementViewport } from './element-editor-types';
import type { VideoWindowBounds } from '../canvas/composables/useCameraZoom';
import { useElementEditor } from './useElementEditor';
import { provideCanvasControlContrast } from '~/ui/ResizeHandle/useCanvasControlContrast';

export function useCanvasElements(options: {
  bounds: () => VideoWindowBounds | null;
  preview: () => ElementViewport;
  clipIdAt: (event: MouseEvent) => string | null;
  canEdit: () => boolean;
  render: () => void;
  canvas?: () => HTMLCanvasElement | null;
}) {
  const contrast = options.canvas ? provideCanvasControlContrast(options.canvas) : null;
  const editor = useElementEditor();
  if (editor) {
    const toast = useToastStore();
    watch(
      () => editor?.layers.value.map((c) => c.text?.style.fontAssetId),
      async () => {
        try {
          await loadElementFonts(editor?.layers.value ?? [], projectFontSource);
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
      editor.finishVector();
      editor.drawingMode.value = false;
    }
  });
  return {
    refreshContrast: () => contrast?.refresh(),
    editor,
    viewport,
    editingId,
    selectionEditingId: computed(() => editingId.value ?? editor?.vectorEditing.value ?? null),
    selectionDisabled: computed(
      () => !options.canEdit() || Boolean(editor?.drawingMode.value || editor?.vectorEditing.value),
    ),
    begin: (event: MouseEvent) => {
      if (event.button !== 0 || !options.canEdit()) return false;
      const id = options.clipIdAt(event);
      return Boolean(id && editor?.beginElement(id));
    },
  };
}
