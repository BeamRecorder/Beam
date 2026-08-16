import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { websiteI18n } from '../i18n';
import WebsiteHudPreview from './WebsiteHudPreview.vue';

const mountPreview = () =>
  mount(WebsiteHudPreview, {
    global: {
      plugins: [websiteI18n],
      stubs: {
        Teleport: true,
      },
    },
  });

describe('WebsiteHudPreview', () => {
  it('mounts the real capture controls', () => {
    const wrapper = mountPreview();
    expect(wrapper.text()).toContain('Choose what to record');
    expect(wrapper.text()).toContain('Screen 1');
    expect(wrapper.get('.selected-thumbnail-wrapper img').attributes('src')).toMatch(/Beam-showcase.*\.png/);
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(2);
  });

  it('toggles demo audio state and requests real demo playback', async () => {
    const wrapper = mountPreview();
    const microphone = wrapper.find('button[aria-pressed="true"]');
    await microphone.trigger('click');
    expect(microphone.attributes('aria-pressed')).toBe('false');

    await wrapper.get('button.btn-primary:not(.btn-sm)').trigger('click');
    expect(wrapper.emitted('play')).toHaveLength(1);
  });
});
