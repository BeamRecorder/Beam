import { afterEach, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createStillDocument } from '@beam/engine';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import ScreenshotLayerControls from './ScreenshotLayerControls.vue';
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.useRealTimers());
it('shows a translated selection hint for each disabled field only after 200 ms', async () => {
  vi.useFakeTimers();
  const wrapper = mount(ScreenshotLayerControls, { attachTo: document.body });
  for (const hint of wrapper.findAll('.control-hint')) {
    await hint.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(199);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('selectElement');
    await hint.trigger('mouseleave');
  }
  wrapper.unmount();
});
it('explains locked and busy states and keeps keyboard access to the hint', async () => {
  vi.useFakeTimers();
  const layer = screenshotLayers(createStillDocument('test', 'source.png', 100, 100).state)[1]!;
  const wrapper = mount(ScreenshotLayerControls, {
    props: { layer: { ...layer, locked: true } },
    attachTo: document.body,
  });
  const hint = wrapper.get('.control-hint');
  expect(hint.attributes('tabindex')).toBe('0');
  await hint.trigger('focusin');
  await vi.advanceTimersByTimeAsync(200);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('locked');
  await hint.trigger('focusout');
  await wrapper.setProps({ disabled: true });
  await hint.trigger('mouseenter');
  await vi.advanceTimersByTimeAsync(200);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('busy');
  wrapper.unmount();
});
it('uses neutral controls and hides disabled hints on an editable selection', async () => {
  const layer = screenshotLayers(createStillDocument('test', 'source.png', 100, 100).state)[1]!;
  const wrapper = mount(ScreenshotLayerControls, { props: { layer }, attachTo: document.body });
  expect(wrapper.get('.select-trigger').classes()).toContain('is-neutral');
  expect(wrapper.get('.input-wrapper').classes()).toContain('input-neutral');
  await wrapper.get('.control-hint').trigger('mouseenter');
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  wrapper.unmount();
});
