import { onBeforeUnmount, ref, watch } from 'vue';

const NAMED_RADII = ['none', 'sm', 'md', 'lg', 'full'];
const PRESET_PREVIEW_MS = 500;

export const useClipCornerRadius = (options: {
  selectedClip: () => { id: string; cornerRadius?: string | number } | null;
  onUpdate: (radius: string) => void;
  onInteractionChange: (interacting: boolean) => void;
}) => {
  const selectedRadius = ref('md');
  const customRadiusValue = ref(32);
  let interactionTimer: ReturnType<typeof setTimeout> | null = null;
  let isInteracting = false;

  const beginInteraction = () => {
    if (interactionTimer) clearTimeout(interactionTimer);
    interactionTimer = null;
    if (isInteracting) return;
    isInteracting = true;
    options.onInteractionChange(true);
  };
  const finishInteraction = () => {
    interactionTimer = null;
    if (!isInteracting) return;
    isInteracting = false;
    options.onInteractionChange(false);
  };
  const endInteraction = (delayMs = 0) => {
    if (interactionTimer) clearTimeout(interactionTimer);
    if (delayMs <= 0) return finishInteraction();
    interactionTimer = setTimeout(finishInteraction, delayMs);
  };

  watch(
    options.selectedClip,
    (clip) => {
      const radius = clip?.cornerRadius ?? 'sm';
      if (typeof radius === 'number') {
        selectedRadius.value = 'custom';
        customRadiusValue.value = radius;
      } else if (NAMED_RADII.includes(radius)) {
        selectedRadius.value = radius === 'full' ? 'custom' : radius;
        if (radius === 'full') customRadiusValue.value = 9999;
      } else {
        selectedRadius.value = 'custom';
        customRadiusValue.value = parseFloat(radius) || 32;
      }
    },
    { immediate: true },
  );

  const handleRadiusChange = (radius: string) => {
    beginInteraction();
    selectedRadius.value = radius;
    options.onUpdate(radius === 'custom' ? String(customRadiusValue.value) : radius);
    endInteraction(PRESET_PREVIEW_MS);
  };
  const handleCustomRadiusChange = (value: number) => {
    const interactionWasActive = isInteracting;
    beginInteraction();
    customRadiusValue.value = value;
    options.onUpdate(String(value));
    if (!interactionWasActive) endInteraction(PRESET_PREVIEW_MS);
  };

  watch(
    () => options.selectedClip()?.id,
    (clipId, previousClipId) => {
      if (!previousClipId || clipId === previousClipId || !isInteracting) return;
      if (interactionTimer) clearTimeout(interactionTimer);
      interactionTimer = null;
      isInteracting = false;
      options.onInteractionChange(false);
    },
  );

  onBeforeUnmount(() => {
    if (interactionTimer) clearTimeout(interactionTimer);
    if (isInteracting) options.onInteractionChange(false);
  });

  return {
    selectedRadius,
    customRadiusValue,
    handleRadiusChange,
    handleCustomRadiusChange,
    beginRadiusInteraction: beginInteraction,
    endRadiusInteraction: endInteraction,
  };
};
