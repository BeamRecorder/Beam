import { nextTick } from 'vue';

// Use the browser constructor: VTU's trigger assigns pointer properties after
// construction, but jsdom now exposes inherited MouseEvent getters as readonly.
export const triggerPointer = async (
  target: { readonly element: Element },
  type: string,
  options: PointerEventInit = {},
): Promise<void> => {
  target.element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: ['pointerdown', 'pointermove'].includes(type) ? 1 : 0,
      isPrimary: true,
      pointerType: 'mouse',
      ...options,
    }),
  );
  await nextTick();
};
