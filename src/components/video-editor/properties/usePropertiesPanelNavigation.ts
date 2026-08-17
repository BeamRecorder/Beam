import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

export function usePropertiesPanelNavigation(options: { contextKey: () => string; canOpenTransitions: () => boolean }) {
  const transitionsOpen = ref(false);
  const navigationDirection = ref<'forward' | 'backward'>('forward');
  const forwardAvailable = ref(false);

  const openTransitions = () => {
    if (!options.canOpenTransitions()) return false;
    navigationDirection.value = 'forward';
    transitionsOpen.value = true;
    forwardAvailable.value = false;
    return true;
  };

  const closeTransitions = () => {
    if (!transitionsOpen.value) return false;
    navigationDirection.value = 'backward';
    transitionsOpen.value = false;
    forwardAvailable.value = true;
    return true;
  };

  watch(options.contextKey, () => {
    transitionsOpen.value = false;
    forwardAvailable.value = false;
  });

  const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

  const handleMouseNavigation = (event: MouseEvent) => {
    if ((event.button !== 3 && event.button !== 4) || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 3) closeTransitions();
    else if (forwardAvailable.value) openTransitions();
  };

  const preventAuxiliaryNavigation = (event: MouseEvent) => {
    if ((event.button === 3 || event.button === 4) && !isEditableTarget(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  onMounted(() => {
    window.addEventListener('mouseup', handleMouseNavigation, { capture: true });
    window.addEventListener('auxclick', preventAuxiliaryNavigation, { capture: true });
  });
  onBeforeUnmount(() => {
    window.removeEventListener('mouseup', handleMouseNavigation, { capture: true });
    window.removeEventListener('auxclick', preventAuxiliaryNavigation, { capture: true });
  });

  return { transitionsOpen, navigationDirection, openTransitions, closeTransitions };
}
