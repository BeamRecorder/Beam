import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import CanvasCropSelection from '../CanvasCropSelection.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CanvasCropSelection', () => {
  it('keeps measurements and confirmation in one teleported HUD outside the crop box', async () => {
    const wrapper = mount(CanvasCropSelection, {
      attachTo: document.body,
      props: {
        containerStyle: { inset: '0' },
        overlayStyle: { left: '10%', top: '20%', width: '60%', height: '50%' },
        measurements: { top: 339, right: 0, bottom: 0, left: 2241, width: 831, height: 523 },
      },
    });
    await flushPromises();

    const cropBox = wrapper.get('.crop-overlay-box');
    const hud = document.body.querySelector<HTMLElement>('.crop-hud');
    expect(cropBox.find('.crop-measurement').exists()).toBe(false);
    expect(cropBox.find('.crop-ok-button').exists()).toBe(false);
    expect(hud).not.toBeNull();
    if (!hud) throw new Error('Crop HUD was not rendered.');
    expect(hud.textContent).toContain('831 × 523 px');
    expect(hud.textContent).toContain('↑ 339');
    expect(hud.textContent).toContain('← 2241');

    (hud.querySelector('.crop-ok-button') as HTMLButtonElement).click();
    expect(wrapper.emitted('done')).toHaveLength(1);
    wrapper.unmount();
    expect(document.body.querySelector('.crop-hud')).toBeNull();
  });
});
