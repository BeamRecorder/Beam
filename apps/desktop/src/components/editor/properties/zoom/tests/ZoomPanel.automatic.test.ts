import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ZoomGenerationButton from '../ZoomGenerationButton.vue';
import ZoomPanel from '../ZoomPanel.vue';
import type { ZoomPanelProps } from '../zoom-panel-types';

enableAutoUnmount(afterEach);
const recording = {
  sessionId: 'session',
  cursor: { available: true, telemetry: [], events: [], catalog: {}, shapes: {}, missing: [] },
};
const create = (props: Partial<ZoomPanelProps> = {}) =>
  mount(ZoomPanel, {
    props: {
      selectedZoom: null,
      canGenerate: false,
      hasAutomaticZooms: false,
      motionBlur: { enabled: false, intensity: 0.55 },
      ...props,
    },
  });

describe('automatic zoom inspector action', () => {
  it.each([null, recording, { ...recording, cursor: { ...recording.cursor, available: false } }])(
    'passes the recording data to the unavailable explanation',
    (editorData) => {
      const wrapper = create({ editorData });
      expect(wrapper.getComponent(ZoomGenerationButton).props('editorData')).toEqual(editorData);
      expect(wrapper.getComponent(ZoomGenerationButton).props('canGenerate')).toBe(false);
      expect(wrapper.get('.header-action button').attributes('disabled')).toBeDefined();
    },
  );

  it('does not open a confirmation for an unavailable recording', async () => {
    const wrapper = create({ editorData: recording });
    await wrapper.get('.header-action button').trigger('click');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(wrapper.emitted('generate')).toBeUndefined();
  });

  it('closes a pending confirmation if the recording becomes unavailable', async () => {
    const wrapper = create({ editorData: recording, canGenerate: true });
    await wrapper.get('.header-action button').trigger('click');
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    await wrapper.setProps({ canGenerate: false });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(wrapper.emitted('generate')).toBeUndefined();
    expect(wrapper.get('.zoom-generation-button').attributes('aria-description')).toContain('no recorded clicks');
  });

  it('keeps automatic generation out of Screenshot', () => {
    const wrapper = create({ still: true, editorData: recording });
    expect(wrapper.findComponent(ZoomGenerationButton).exists()).toBe(false);
  });
});

it.each([false, true])(
  'hides the experimental switch while keeping background zoom for experimental=%s',
  async (experimentalZoom) => {
    const autoFollow = {
      experimentalZoom,
      zoomBackground: true,
      safeZone: 0.5,
      responsiveness: 0.55,
      directionLock: true,
    };
    const wrapper = create({ autoFollow });
    expect(wrapper.find('.experimental-zoom-setting').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Experimental zoom"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Use Recordly-style 2D zooms');
    const toggle = wrapper.get('[role="switch"][aria-label="Zoom background"]');
    expect(toggle.attributes('aria-checked')).toBe('true');
    await toggle.trigger('click');
    expect(wrapper.emitted('update:autoFollow')?.[0]?.[0]).toEqual({ ...autoFollow, zoomBackground: false });
  },
);
it('keeps project camera switches out of Screenshot', () => {
  const wrapper = create({ still: true });
  expect(wrapper.find('[aria-label="Experimental zoom"]').exists()).toBe(false);
  expect(wrapper.find('[aria-label="Zoom background"]').exists()).toBe(false);
});
it('generates free-slot experimental zooms without presenting a replace confirmation', async () => {
  const wrapper = create({
    canGenerate: true,
    hasAutomaticZooms: true,
    autoFollow: { experimentalZoom: true, safeZone: 0.5, responsiveness: 0.55, directionLock: true },
  });
  expect(wrapper.get('.zoom-generation-button').text()).toContain('Generate Auto Zooms');
  await wrapper.get('.header-action button').trigger('click');
  expect(wrapper.emitted('generate')).toEqual([['2d']]);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
});
