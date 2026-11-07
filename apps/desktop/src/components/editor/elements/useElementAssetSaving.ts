import { hasInjectionContext, inject, provide, shallowRef, watch, type InjectionKey } from 'vue';
import type { Clip, ShapeClip } from '@beam/engine/shared/composition-types';
import type { ElementEditorContext } from './element-editor-types';
import type { ElementAssetSaveDraft, ElementAssetSaving } from './element-asset-saving-types';

const key: InjectionKey<ElementAssetSaving> = Symbol('element-asset-saving');
export const useElementAssetSaving = () => (hasInjectionContext() ? inject(key, null) : null);

export function provideElementAssetSaving(editor: ElementEditorContext, label: () => string) {
  const draft = shallowRef<ElementAssetSaveDraft | null>(null);
  let sourceId: string | null = null;
  const supports = (clip: Clip | null | undefined): clip is ShapeClip =>
    clip?.kind === 'shape' && (clip.family === 'shape' || clip.family === 'arrow');
  const canSave = (clip: Clip | null | undefined) =>
    supports(clip) && editor.canInteract.value && Boolean(editor.canvasSize.value);
  const close = () => {
    draft.value = null;
    sourceId = null;
  };
  const saving: ElementAssetSaving = {
    draft,
    label,
    supports,
    canSave,
    close,
    source: (id) => editor.layers.value.find((clip) => clip.id === id) ?? null,
    request: (clip) => {
      if (!supports(clip) || !canSave(clip)) return;
      const current = saving.source(clip.id);
      if (!supports(current)) return;
      const editing = editor.editing.value;
      draft.value = JSON.parse(
        JSON.stringify({
          clip: { ...current, ...(editing?.id === current.id ? { text: editing.text } : {}) },
          canvas: editor.canvasSize.value!,
        }),
      ) as ElementAssetSaveDraft;
      sourceId = current.id;
    },
  };
  watch([editor.layers, editor.canInteract], () => {
    if (!editor.canInteract.value || (sourceId && !saving.source(sourceId))) close();
  });
  provide(key, saving);
  return saving;
}
