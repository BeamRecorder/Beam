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
