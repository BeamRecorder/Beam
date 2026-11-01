import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import ScreenshotViewControls from '../ScreenshotViewControls.vue';
import { documentFixture } from './screenshot-editor-test-helpers';
import { screenshotState } from '../screenshot-state';

enableAutoUnmount(afterEach);
const create = (realPopover = false, realSizes = false) => {
  const screenshotDocument = documentFixture();
  return mount(ScreenshotViewControls, {
    attachTo: realPopover ? document.body : undefined,
    props: {
      document: screenshotDocument,
      canvas: screenshotState(screenshotDocument).canvas,
      advanced: false,
      keepAspect: true,
      disabled: false,
      canFullscreen: true,
      zoomPercent: 112,
      viewMode: 'fit',
    },
    global: {
      stubs: {
        Popover: realPopover
          ? false
          : {
              name: 'Popover',
              props: ['direction', 'align', 'matchTriggerWidth'],
              methods: { close() {} },
              template: '<div><slot name="trigger" :is-open="false" /><slot :close="close" /></div>',
            },
        ScreenshotSizeControls: realSizes
          ? false
          : {
              name: 'ScreenshotSizeControls',
              props: ['original', 'canvas', 'advanced', 'keepAspect'],
              emits: ['update:canvas', 'update:advanced', 'update:keepAspect'],
              template: '<div data-testid="size-controls"><input aria-label="Width" /></div>',
            },
      },
    },
  });
};
it('keeps the view percentage visible and offers fit and actual size separately from dimensions', async () => {
  const wrapper = create();
  expect(wrapper.get('button[aria-label="Dimensions"]').text()).toContain('1200 × 800');
  expect(wrapper.get('button[aria-label="Canvas zoom: 112%"] span').text()).toBe('View · 112%');
  expect(wrapper.findComponent({ name: 'Popover' }).props('direction')).toBe('down');
  const fit = wrapper.findAll('button').find((button) => button.text().includes('Fit large images to window'))!;
  expect(fit.attributes('aria-checked')).toBe('true');
  await fit.trigger('click');
  expect(wrapper.emitted('view')).toEqual([['fit']]);
  await wrapper
    .findAll('button')
    .find((button) => button.text().includes('Actual size (100%)'))!
    .trigger('click');
  expect(wrapper.emitted('view')?.at(-1)).toEqual(['actual']);
  await wrapper.get('button[aria-label="Fullscreen preview"]').trigger('click');
  expect(wrapper.emitted('fullscreen')).toHaveLength(1);
});
it('opens the dimensions popover and focuses its first editable field from a search command', async () => {
  const wrapper = create(true);
  await wrapper.vm.openDimensions();
  await flushPromises();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Width');
  expect(document.querySelector('.canvas-size-popover')).not.toBeNull();
});
it('keeps an already open dimensions popover open when invoked again', async () => {
  const wrapper = create(true);
  await wrapper.vm.openDimensions();
  await wrapper.vm.openDimensions();
  await flushPromises();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Width');
  expect(document.querySelector('.canvas-size-popover')).not.toBeNull();
});
it('ignores requests to open dimensions while disabled', async () => {
  const wrapper = create(true);
  await wrapper.setProps({ disabled: true });
  await wrapper.vm.openDimensions();
  expect(document.querySelector('.canvas-size-popover')).toBeNull();
});
it('focuses the size preset when custom width/height inputs are hidden by default', async () => {
  const wrapper = create(true, true);
  await wrapper.vm.openDimensions();
  await flushPromises();
  expect(document.activeElement?.getAttribute('aria-haspopup')).toBe('listbox');
  expect(document.activeElement?.closest('.canvas-size-popover')).not.toBeNull();
});
it('keeps dimensions editable when entering fullscreen is unavailable and disables all controls when busy', async () => {
  const wrapper = create();
  await wrapper.setProps({ canFullscreen: false });
  expect(wrapper.get('button[aria-label="Dimensions"]').attributes('disabled')).toBeUndefined();
  await wrapper.get('button[aria-label="Fullscreen preview"]').trigger('click');
  expect(wrapper.emitted('fullscreen')).toBeUndefined();
  await wrapper.setProps({ disabled: true });
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  await wrapper
    .findAll('button')
    .find((button) => button.text().includes('Fit large images to window'))!
    .trigger('click');
  expect(wrapper.emitted('view')).toBeUndefined();
});
it('forwards output dimensions and disclosure models independently from the preview zoom', async () => {
  const wrapper = create();
  const controls = wrapper.findComponent({ name: 'ScreenshotSizeControls' });
  const canvas = { ...wrapper.props('canvas'), width: 1920, height: 1080 };
  controls.vm.$emit('update:canvas', canvas);
  controls.vm.$emit('update:advanced', true);
  controls.vm.$emit('update:keepAspect', false);
  await wrapper.vm.$nextTick();
  expect(wrapper.emitted('update:canvas')).toEqual([[canvas]]);
  expect(wrapper.emitted('update:advanced')).toEqual([[true]]);
  expect(wrapper.emitted('update:keepAspect')).toEqual([[false]]);
  expect(wrapper.props('zoomPercent')).toBe(112);
});

it('updates the visible percentage and selection after view changes', async () => {
  const wrapper = create();
  await wrapper.setProps({ zoomPercent: 100, viewMode: 'actual' });
  expect(wrapper.get('button[aria-label="Canvas zoom: 100%"] span').text()).toBe('View · 100%');
  const actual = wrapper.findAll('button').find((button) => button.text().includes('Actual size (100%)'))!;
  expect(actual.attributes('aria-checked')).toBe('true');
  for (const label of ['Zoom in canvas', 'Zoom out canvas'])
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes(label))!
      .trigger('click');
  expect(wrapper.emitted('view')).toEqual([['zoom-in'], ['zoom-out']]);
});
