import { defineComponent, h, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { captureExportMorph, useExportPillMorph } from '../useExportPillMorph';
import type { ExportMorphSource } from '../export-status-types';

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());
const bounds = { left: 100, top: 40, width: 800, height: 440 };
const setup = (source?: ExportMorphSource | null, target = true) =>
  mount(
    defineComponent({
      setup() {
        const host = ref<HTMLElement | null>(null);
        const { ghost, morphing } = useExportPillMorph(host, source);
        return () =>
          h('div', [
            h('div', { ref: host }, target ? [h('div', { class: 'snip-pill' })] : []),
            h('div', { ref: ghost, class: 'ghost' }),
            h('span', { class: 'morphing' }, String(morphing.value)),
          ]);
      },
    }),
  );

it('captures only an inert visual copy with its original bounds and no duplicate dialog/IDs', () => {
  const dialog = document.createElement('div');
  dialog.id = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = '<input id="name" value="Walkthrough"><button>Export</button>';
  const click = vi.fn();
  dialog.querySelector('button')!.addEventListener('click', click);
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(bounds as DOMRect);
  const source = captureExportMorph(dialog)!;
  expect(source).toMatchObject(bounds);
  expect(source.snapshot).not.toBe(dialog);
  expect(source.snapshot!.getAttribute('role')).toBeNull();
  expect(source.snapshot!.getAttribute('aria-modal')).toBeNull();
  expect(source.snapshot!.querySelector('[id]')).toBeNull();
  expect(source.snapshot!.querySelector('input')!.value).toBe('Walkthrough');
  source.snapshot!.querySelector('button')!.click();
  expect(click).not.toHaveBeenCalled();
  expect(captureExportMorph(null)).toBeNull();
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect);
  expect(captureExportMorph(dialog)).toBeNull();
});

it.each([undefined, null, bounds])('releases the pill when browser animation is unavailable (%s)', async (source) => {
  const wrapper = setup(source);
  await flushPromises();
  expect(wrapper.get('.morphing').text()).toBe('false');
});

it('skips the morph for reduced motion and for a removed target', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  const reduced = setup(bounds);
  await flushPromises();
  expect(reduced.get('.morphing').text()).toBe('false');
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  const missing = setup(bounds, false);
  await flushPromises();
  expect(missing.get('.morphing').text()).toBe('false');
});

const animate = () => {
  let finish!: () => void;
  let fail!: (reason: unknown) => void;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const cancel = vi.fn();
  const native = vi.fn(() => ({ finished, cancel }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: native });
  return { finish, fail, cancel, native };
};
afterEach(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

it('moves the measured decorative surface, fades its copied content and releases animation resources', async () => {
  const animation = animate();
  const snapshot = document.createElement('div');
  snapshot.textContent = 'Export settings';
  const wrapper = setup({ ...bounds, snapshot });
  await flushPromises();
  expect(wrapper.get('.morphing').text()).toBe('true');
  expect(animation.native).toHaveBeenCalledTimes(2);
  expect(wrapper.get('.ghost').text()).toBe('Export settings');
  expect(animation.native.mock.calls[1]).toEqual([
    expect.arrayContaining([
      expect.objectContaining({ transform: expect.stringContaining('translate3d(-100px, -40px, 0)') }),
    ]),
    expect.objectContaining({ duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }),
  ]);
  animation.finish();
  await flushPromises();
  expect(wrapper.get('.morphing').text()).toBe('false');
  expect(animation.cancel).toHaveBeenCalledTimes(2);
});

it('releases the pill when an animation is cancelled and cleans up on unmount', async () => {
  const animation = animate();
  const wrapper = setup(bounds);
  await flushPromises();
  wrapper.unmount();
  expect(animation.cancel).toHaveBeenCalled();
  animation.fail(new DOMException('cancelled', 'AbortError'));
  await flushPromises();
});

it('never starts an animation after its editor was disposed during mounting', async () => {
  const animation = animate();
  const wrapper = setup(bounds);
  wrapper.unmount();
  await flushPromises();
  expect(animation.native).not.toHaveBeenCalled();
});
