import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useScrollShadow } from './useScrollShadow';

describe('useScrollShadow', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    Object.defineProperty(element, 'clientHeight', { value: 100, writable: true, configurable: true });
    Object.defineProperty(element, 'scrollHeight', { value: 300, writable: true, configurable: true });
    Object.defineProperty(element, 'clientWidth', { value: 100, writable: true, configurable: true });
    Object.defineProperty(element, 'scrollWidth', { value: 300, writable: true, configurable: true });
    Object.defineProperty(element, 'scrollTop', { value: 0, writable: true, configurable: true });
    Object.defineProperty(element, 'scrollLeft', { value: 0, writable: true, configurable: true });
  });

  it('initializes with bottom shadow when content is scrollable and at top', () => {
    const target = ref<HTMLElement | null>(element);
    const { hasTopShadow, hasBottomShadow, isScrollableY } = useScrollShadow(target);

    expect(isScrollableY.value).toBe(true);
    expect(hasTopShadow.value).toBe(false);
    expect(hasBottomShadow.value).toBe(true);
  });

  it('shows top and bottom shadows when scrolled to middle', () => {
    const target = ref<HTMLElement | null>(element);
    const { hasTopShadow, hasBottomShadow, updateShadows } = useScrollShadow(target);

    Object.defineProperty(element, 'scrollTop', { value: 50, writable: true, configurable: true });
    updateShadows();

    expect(hasTopShadow.value).toBe(true);
    expect(hasBottomShadow.value).toBe(true);
  });

  it('shows only top shadow when scrolled to bottom', () => {
    const target = ref<HTMLElement | null>(element);
    const { hasTopShadow, hasBottomShadow, updateShadows } = useScrollShadow(target);

    Object.defineProperty(element, 'scrollTop', { value: 200, writable: true, configurable: true });
    updateShadows();

    expect(hasTopShadow.value).toBe(true);
    expect(hasBottomShadow.value).toBe(false);
  });

  it('does not show any shadow when content fits container', () => {
    Object.defineProperty(element, 'scrollHeight', { value: 100, writable: true, configurable: true });
    const target = ref<HTMLElement | null>(element);
    const { hasTopShadow, hasBottomShadow, isScrollableY } = useScrollShadow(target);

    expect(isScrollableY.value).toBe(false);
    expect(hasTopShadow.value).toBe(false);
    expect(hasBottomShadow.value).toBe(false);
  });

  it('handles horizontal orientation correctly', () => {
    const target = ref<HTMLElement | null>(element);
    const { hasLeftShadow, hasRightShadow, isScrollableX, updateShadows } = useScrollShadow(target, {
      orientation: 'horizontal',
    });

    expect(isScrollableX.value).toBe(true);
    expect(hasLeftShadow.value).toBe(false);
    expect(hasRightShadow.value).toBe(true);

    Object.defineProperty(element, 'scrollLeft', { value: 50, writable: true, configurable: true });
    updateShadows();

    expect(hasLeftShadow.value).toBe(true);
    expect(hasRightShadow.value).toBe(true);

    Object.defineProperty(element, 'scrollLeft', { value: 200, writable: true, configurable: true });
    updateShadows();

    expect(hasLeftShadow.value).toBe(true);
    expect(hasRightShadow.value).toBe(false);
  });

  it('respects isEnabled option', () => {
    const isEnabled = ref(false);
    const target = ref<HTMLElement | null>(element);
    const { hasTopShadow, hasBottomShadow, updateShadows } = useScrollShadow(target, {
      isEnabled,
    });

    expect(hasTopShadow.value).toBe(false);
    expect(hasBottomShadow.value).toBe(false);

    isEnabled.value = true;
    updateShadows();

    expect(hasBottomShadow.value).toBe(true);
  });

  it('handles null target gracefully', () => {
    const target = ref<HTMLElement | null>(null);
    const { hasTopShadow, hasBottomShadow, isScrollableY } = useScrollShadow(target);

    expect(isScrollableY.value).toBe(false);
    expect(hasTopShadow.value).toBe(false);
    expect(hasBottomShadow.value).toBe(false);
  });
});
