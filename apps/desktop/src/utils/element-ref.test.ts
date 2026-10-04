import { ref } from 'vue';
import { expect, it } from 'vitest';
import { bindElementRef } from './element-ref';
it('accepts the expected DOM element', () => {
  const target = ref<HTMLDivElement | null>(null),
    div = document.createElement('div');
  bindElementRef(target, HTMLDivElement)(div);
  expect(target.value).toBe(div);
});
it('rejects a different DOM element', () => {
  const target = ref<HTMLDivElement | null>(null);
  bindElementRef(target, HTMLDivElement)(document.createElement('span'));
  expect(target.value).toBeNull();
});
it('clears a released DOM reference', () => {
  const target = ref<HTMLDivElement | null>(document.createElement('div'));
  bindElementRef(target, HTMLDivElement)(null);
  expect(target.value).toBeNull();
});
