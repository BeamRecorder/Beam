import { computed, ref, watch } from 'vue';
import { isVisualClip, type NormalizedCrop } from '~/media/shared/composition-types';
import type { CropPreviewOptions } from '../composition/crop/crop-types';

// Drafts never mutate the saved composition or enter the undo history.
export function useCropPreview(options: CropPreviewOptions) {
  const cropPreview = ref<NormalizedCrop | null>(null);
  const previewCrop = (crop: NormalizedCrop | null) => {
    cropPreview.value = crop;
  };
  const cropCompositionPreview = computed(() => {
    if (!cropPreview.value) return null;
    const crop = cropPreview.value;
    const selected = new Set(options.selectedClipIds.value);
    return {
      ...options.composition.value,
      clips: options.composition.value.clips.map((clip) =>
        selected.has(clip.id) && isVisualClip(clip) ? { ...clip, crop, cameraFramingPreset: 'custom' as const } : clip,
      ),
    };
  });
  watch([options.composition, () => options.selectedClipIds.value.join('\0')], () => previewCrop(null), {
    flush: 'sync',
  });
  return { cropPreview, cropCompositionPreview, previewCrop };
}
