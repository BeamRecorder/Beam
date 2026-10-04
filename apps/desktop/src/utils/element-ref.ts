import type { Ref, ComponentPublicInstance } from 'vue';
export function bindElementRef<T extends Element>(target: Ref<T | null>, constructor: { new (): T }) {
  return (element: Element | ComponentPublicInstance | null) => {
    target.value = element instanceof constructor ? element : null;
  };
}
