import { ref, unref, watch, onMounted, onBeforeUnmount, getCurrentInstance, type Ref } from 'vue';
import type { ScrollShadowOptions, ScrollShadowReturn } from './scroll-shadow-types';

export function useScrollShadow(
  target: Ref<HTMLElement | null | undefined>,
  options: ScrollShadowOptions = {},
): ScrollShadowReturn {
  const hasTopShadow = ref(false);
  const hasBottomShadow = ref(false);
  const hasLeftShadow = ref(false);
  const hasRightShadow = ref(false);
  const isScrollableY = ref(false);
  const isScrollableX = ref(false);

  let rafId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;

  const updateShadows = () => {
    const el = unref(target);
    const isEnabled = unref(options.isEnabled ?? true);

    if (!el || !isEnabled) {
      hasTopShadow.value = false;
      hasBottomShadow.value = false;
      hasLeftShadow.value = false;
      hasRightShadow.value = false;
      isScrollableY.value = false;
      isScrollableX.value = false;
      return;
    }

    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = el;
    const offset = options.offset ?? 2;
    const orientation = options.orientation ?? 'vertical';

    if (orientation === 'vertical' || orientation === 'both') {
      const scrollableY = scrollHeight > clientHeight + 1;
      isScrollableY.value = scrollableY;
      hasTopShadow.value = scrollableY && scrollTop > offset;
      hasBottomShadow.value = scrollableY && Math.ceil(scrollTop + clientHeight) < scrollHeight - offset;
    } else {
      isScrollableY.value = false;
      hasTopShadow.value = false;
      hasBottomShadow.value = false;
    }

    if (orientation === 'horizontal' || orientation === 'both') {
      const scrollableX = scrollWidth > clientWidth + 1;
      isScrollableX.value = scrollableX;
      hasLeftShadow.value = scrollableX && scrollLeft > offset;
      hasRightShadow.value = scrollableX && Math.ceil(scrollLeft + clientWidth) < scrollWidth - offset;
    } else {
      isScrollableX.value = false;
      hasLeftShadow.value = false;
      hasRightShadow.value = false;
    }
  };

  const scheduleUpdate = () => {
    if (typeof window === 'undefined') return;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      updateShadows();
    });
  };

  const cleanupListeners = (element: HTMLElement | null) => {
    if (element) {
      element.removeEventListener('scroll', scheduleUpdate);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const attachListeners = (element: HTMLElement | null) => {
    cleanupListeners(element);
    if (!element) return;

    element.addEventListener('scroll', scheduleUpdate, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(element);
      if (element.firstElementChild) {
        resizeObserver.observe(element.firstElementChild);
      }
    }

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        scheduleUpdate();
      });
      mutationObserver.observe(element, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });
    }

    updateShadows();
  };

  watch(
    () => unref(target),
    (newEl, oldEl) => {
      if (oldEl) cleanupListeners(oldEl);
      if (newEl) attachListeners(newEl);
    },
    { flush: 'post' },
  );

  if (options.isEnabled !== undefined) {
    watch(
      () => unref(options.isEnabled),
      () => {
        scheduleUpdate();
      },
    );
  }

  const initialEl = unref(target);
  if (initialEl) {
    attachListeners(initialEl);
  }

  const instance = getCurrentInstance();
  if (instance) {
    onMounted(() => {
      const el = unref(target);
      if (el) {
        attachListeners(el);
      }
    });

    onBeforeUnmount(() => {
      cleanupListeners(unref(target) ?? null);
    });
  }

  return {
    hasTopShadow,
    hasBottomShadow,
    hasLeftShadow,
    hasRightShadow,
    isScrollableY,
    isScrollableX,
    updateShadows,
  };
}
