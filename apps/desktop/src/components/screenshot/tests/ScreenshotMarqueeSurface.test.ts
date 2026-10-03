import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { it, expect, vi } from 'vitest';
import ScreenshotMarqueeSurface from '../ScreenshotMarqueeSurface.vue';
import CanvasMarqueeSurface from '../../editor/canvas/CanvasMarqueeSurface.vue';
function fixture() {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 150, 800, 450));
  const wrapper = mount(ScreenshotMarqueeSurface, {
    props: {
      canvas,
      viewport: { width: 800, height: 450 },
      targets: () => [{ id: 'a', x: 80, y: 45, width: 160, height: 90 }],
      selection: [],
      disabled: false,
      spacePressed: false,
      layerAt: () => null,
    },
    slots: { default: () => [h('canvas'), h('button'), h('div', { class: 'webcam-selection' })] },
  });
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 1200, 700));
  Object.defineProperties(wrapper.element, { clientWidth: { value: 1200 }, clientHeight: { value: 700 } });
  return { wrapper, shared: wrapper.getComponent(CanvasMarqueeSurface) };
}
it('provides workspace coordinates only when a gesture asks for targets and forwards selection', () => {
  const { wrapper, shared } = fixture();
  expect(shared.props('targets')()).toEqual([{ id: 'a', x: 280, y: 145, width: 160, height: 90 }]);
  const selection = { ids: ['a'], primaryId: 'a', additive: false };
  shared.vm.$emit('select', selection);
  expect(wrapper.emitted('select')).toEqual([[selection]]);
  const event = new MouseEvent('pointerdown');
  expect(shared.props('canStartLeft')(event)).toBe(true);
  wrapper.unmount();
});
it('keeps controls and selected handles interactive and lets Space pan instead of selecting', async () => {
  const { wrapper, shared } = fixture();
  for (const node of [wrapper.get('button').element, wrapper.get('.webcam-selection').element]) {
    const event = new MouseEvent('pointerdown');
    Object.defineProperty(event, 'target', { value: node });
    expect(shared.props('canStartLeft')(event)).toBe(false);
  }
  await wrapper.setProps({ spacePressed: true });
  expect(shared.props('canStartLeft')(new MouseEvent('pointerdown'))).toBe(false);
  await wrapper.setProps({ spacePressed: false, layerAt: () => 'a' });
  expect(shared.props('canStartLeft')(new MouseEvent('pointerdown'))).toBe(false);
  wrapper.unmount();
});
it('supplies no targets until the real canvas is available', async () => {
  const { wrapper, shared } = fixture();
  await wrapper.setProps({ canvas: null });
  expect(shared.props('targets')()).toEqual([]);
  wrapper.unmount();
});
