import { computed, ref, watch, type CSSProperties, type Ref } from 'vue';
import { isTextCaptionClip, type ClipComposition } from '~/media/shared/composition-types';
import { outputPreviewRect, type OutputCanvasSettings } from '../output-canvas';
import type { TransformClip } from '../editor-canvas-types';
import type { CaptionInlineTextUpdate } from '../caption-inline-editor-types';

export function useCaptionInlineEditing(options: {
  composition: () => ClipComposition;
  selectedClip: () => TransformClip | null;
  isPlaying: () => boolean;
  isCropping: () => boolean;
  isManualZoom: () => boolean;
  logicalSize: Ref<{ width: number; height: number }>;
  outputCanvas: () => OutputCanvasSettings;
  selectionViewportStyle: () => CSSProperties;
  selectionLayoutStyle: () => CSSProperties;
  clipIdAt: (event: Pick<MouseEvent, 'clientX' | 'clientY'>) => string | null;
  activeCaptionIds: () => readonly string[];
  onSelect: (clipId: string) => void;
  onUpdate: (value: CaptionInlineTextUpdate) => void;
  onStart: () => void;
  onEnd: (cancelled: boolean) => void;
  onRender: () => void;
}) {
  const editingCaptionId = ref<string | null>(null);
  const originalCustomText = ref<string | undefined>(undefined);
  const editingCaption = computed(() => {
    const clip = options.composition().clips.find((candidate) => candidate.id === editingCaptionId.value);
    return clip && isTextCaptionClip(clip) ? clip : null;
  });
  const renderScale = computed(() => {
    const size = options.logicalSize.value;
    const output = options.outputCanvas();
    return outputPreviewRect(size.width, size.height, output).width / Math.max(1, output.width);
  });
  const warningPlacement = computed<'above' | 'below'>(() => {
    const viewportTop = Number.parseFloat(String(options.selectionViewportStyle().top ?? 0));
    const layoutTop = Number.parseFloat(String(options.selectionLayoutStyle().top ?? 0));
    return viewportTop + layoutTop < 52 ? 'below' : 'above';
  });

  const close = (cancelled: boolean) => {
    if (!editingCaptionId.value) return;
    editingCaptionId.value = null;
    originalCustomText.value = undefined;
    options.onEnd(cancelled);
    options.onRender();
  };
  const finish = () => close(false);
  const cancel = () => {
    const clipId = editingCaptionId.value;
    if (!clipId) return;
    options.onUpdate({ clipId, customText: originalCustomText.value });
    close(true);
  };
  const update = (customText: string) => {
    const clipId = editingCaptionId.value;
    if (clipId) options.onUpdate({ clipId, customText });
  };
  const begin = (event: Pick<MouseEvent, 'clientX' | 'clientY' | 'button'>) => {
    if (event.button !== 0 || options.isPlaying() || options.isCropping() || options.isManualZoom()) return;
    const clipId = options.clipIdAt(event);
    const clip = options.composition().clips.find((candidate) => candidate.id === clipId);
    if (!clip || !isTextCaptionClip(clip)) return;
    if (options.selectedClip()?.id !== clip.id) options.onSelect(clip.id);
    options.onStart();
    editingCaptionId.value = clip.id;
    originalCustomText.value = clip.caption.style.customText;
    options.onRender();
  };

  watch(
    [options.isPlaying, options.isCropping, () => options.selectedClip()?.id],
    ([playing, cropping, selectedId]) => {
      if (editingCaptionId.value && (playing || cropping || (selectedId && selectedId !== editingCaptionId.value)))
        finish();
    },
  );
  watch(options.activeCaptionIds, (ids) => {
    if (editingCaptionId.value && !ids.includes(editingCaptionId.value)) finish();
  });

  return { editingCaptionId, editingCaption, renderScale, warningPlacement, begin, update, finish, cancel };
}
