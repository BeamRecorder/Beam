import { ref, watch } from 'vue';
import type { Ref } from 'vue';

/** Covers both Tooltip-inside-trigger and Tooltip-around-Popover without disabling content hints. */
export function usePopoverTriggerSuppression(wrapper: Ref<HTMLElement | null>) {
  const suppressed = ref(false);
  const isSuppressed = () => {
    const element = wrapper.value;
    const open = Boolean(
      element &&
      (element.closest('.popover-trigger[data-popover-open="true"]') ||
        element.querySelector('.popover-trigger[data-popover-open="true"]')),
    );
    suppressed.value = open;
    return open;
  };
  watch(
    wrapper,
    (element, _previous, onCleanup) => {
      if (!element) return;
      const observer = new MutationObserver(isSuppressed);
      const options = { attributes: true, attributeFilter: ['data-popover-open'] };
      observer.observe(element, { ...options, subtree: true });
      const trigger = element.closest('.popover-trigger');
      if (trigger && trigger !== element) observer.observe(trigger, options);
      isSuppressed();
      onCleanup(() => observer.disconnect());
    },
    { flush: 'post' },
  );
  return { suppressed, isSuppressed };
}
