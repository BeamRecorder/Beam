import { computed, onBeforeUnmount, ref, watch, type CSSProperties, type Ref } from 'vue';
import { isTextCaptionClip, type ClipComposition } from '@beam/engine/shared/composition-types';
import { outputPreviewRect, type OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
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
  const draftText = ref<string | undefined>(undefined);
  const editingCaption = computed(() => {
    if (!editingCaptionId.value) return null;
    const clip = options.composition().clips.find((candidate) => candidate.id === editingCaptionId.value);
    if (!clip || !isTextCaptionClip(clip)) return null;
    return {
      ...clip,
      caption: { ...clip.caption, style: { ...clip.caption.style, customText: draftText.value } },
    };
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
    draftText.value = undefined;
    options.onEnd(cancelled);
    options.onRender();
  };
  const finish = () => {
    const clipId = editingCaptionId.value;
    if (!clipId) return;
    const clip = options.composition().clips.find((candidate) => candidate.id === clipId);
    if (clip && isTextCaptionClip(clip) && !clip.locked && draftText.value !== clip.caption.style.customText)
      options.onUpdate({ clipId, customText: draftText.value });
    close(false);
  };
  const cancel = () => close(true);
  const update = (customText: string) => {
    const clipId = editingCaptionId.value;
    if (clipId && editingCaption.value && !editingCaption.value.locked) draftText.value = customText;
  };
  const begin = (event: Pick<MouseEvent, 'clientX' | 'clientY' | 'button'>) => {
    if (event.button !== 0 || options.isPlaying() || options.isCropping() || options.isManualZoom()) return false;
    const clipId = options.clipIdAt(event);
    const clip = options.composition().clips.find((candidate) => candidate.id === clipId);
    if (!clip || clip.locked || !isTextCaptionClip(clip)) return false;
    if (editingCaptionId.value === clip.id) return true;
    finish();
    if (options.selectedClip()?.id !== clip.id) options.onSelect(clip.id);
    options.onStart();
    editingCaptionId.value = clip.id;
    draftText.value = clip.caption.style.customText;
    options.onRender();
    return true;
  };

  watch(
    [options.isPlaying, options.isCropping, () => options.selectedClip()?.id],
    ([playing, cropping, selectedId]) => {
      if (editingCaptionId.value && (playing || cropping || (selectedId && selectedId !== editingCaptionId.value)))
        finish();
    },
  );
  watch(
    () => editingCaption.value?.locked,
    (locked) => {
      if (locked) finish();
    },
    { flush: 'sync' },
  );
  watch(options.activeCaptionIds, (ids) => {
    if (editingCaptionId.value && !ids.includes(editingCaptionId.value)) finish();
  });
  onBeforeUnmount(finish);

  return {
    editingCaptionId,
    editingCaption,
    renderScale,
    warningPlacement,
    begin,
    update,
    finish,
    cancel,
  };
}
