import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AudioPanel from './AudioPanel.vue';

const BigSlider = {
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template:
    '<button class="big-slider" :data-label="label" @click="$emit(\'update:modelValue\', 42)">{{ label }}: {{ modelValue }}</button>',
};

const ClipActionGroup = {
  props: ['enabled', 'enabledLabel', 'disabledLabel', 'deleteLabel'],
  emits: ['toggle', 'delete'],
  template: `
    <div class="clip-action-group" :data-enabled="enabled" :data-delete-label="deleteLabel">
      <button class="audio-toggle" @click="$emit('toggle')">Toggle</button>
      <button class="audio-delete" @click="$emit('delete')">Delete</button>
    </div>
  `,
};

const Switch = {
  props: ['modelValue', 'disabled', 'ariaLabel'],
  emits: ['update:modelValue'],
  template:
    '<button class="switch-stub" :disabled="disabled" :aria-checked="modelValue" :aria-label="ariaLabel" @click="$emit(\'update:modelValue\', !modelValue)">Switch</button>',
};

const stubs = { BigSlider, ClipActionGroup, Switch };

describe('AudioPanel', () => {
  it('emits global, device and volume changes', async () => {
    const wrapper = mount(AudioPanel, {
      props: {
        volume: 80,
        isSystemAudioEnabled: true,
        isMicAudioEnabled: true,
        hasSystemAudio: true,
        hasMicAudio: true,
        systemVolume: 60,
        micVolume: 40,
      },
      global: { stubs },
    });

    const sliders = wrapper.findAll('.big-slider');
    expect(sliders).toHaveLength(3);
    await sliders[0].trigger('click');
    await sliders[1].trigger('click');
    await sliders[2].trigger('click');
    await wrapper.findAll('.audio-toggle')[0].trigger('click');
    await wrapper.findAll('.audio-toggle')[1].trigger('click');
    await wrapper.findAll('.audio-delete')[0].trigger('click');
    await wrapper.findAll('.audio-delete')[1].trigger('click');

    expect(wrapper.emitted('update:volume')).toEqual([[42]]);
    expect(wrapper.emitted('update:systemVolume')).toEqual([[42]]);
    expect(wrapper.emitted('update:micVolume')).toEqual([[42]]);
    expect(wrapper.emitted('update:isSystemAudioEnabled')).toEqual([[false]]);
    expect(wrapper.emitted('update:isMicAudioEnabled')).toEqual([[false]]);
    expect(wrapper.emitted('delete:system')).toEqual([[]]);
    expect(wrapper.emitted('delete:microphone')).toEqual([[]]);
  });

  it('renders only sections for matching audio tracks', async () => {
    const wrapper = mount(AudioPanel, {
      props: {
        volume: 100,
        isSystemAudioEnabled: true,
        isMicAudioEnabled: true,
        hasSystemAudio: true,
        hasMicAudio: false,
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain('System Sound Track');
    expect(wrapper.text()).not.toContain('Microphone Track');
    expect(wrapper.findAll('.audio-section')).toHaveLength(1);
    expect(wrapper.findAll('.clip-action-group')).toHaveLength(1);

    await wrapper.setProps({ hasSystemAudio: false, hasMicAudio: true });

    expect(wrapper.text()).not.toContain('System Sound Track');
    expect(wrapper.text()).toContain('Microphone Track');
    expect(wrapper.findAll('.audio-section')).toHaveLength(1);
    expect(wrapper.findAll('.clip-action-group')).toHaveLength(1);
  });

  it('shows an explicit empty state when no audio tracks exist', () => {
    const wrapper = mount(AudioPanel, {
      props: {
        volume: 100,
        isSystemAudioEnabled: false,
        isMicAudioEnabled: false,
        hasSystemAudio: false,
        hasMicAudio: false,
      },
      global: { stubs },
    });

    expect(wrapper.get('[role="status"]').text()).toContain('No microphone or system audio track was detected.');
    expect(wrapper.findAll('.audio-section')).toHaveLength(0);
    expect(wrapper.findAll('.clip-action-group')).toHaveLength(0);
    expect(wrapper.findAll('.big-slider')).toHaveLength(1);
  });

  it('renders the global normalization switch last and emits both states', async () => {
    const wrapper = mount(AudioPanel, {
      props: {
        volume: 100,
        isSystemAudioEnabled: true,
        isMicAudioEnabled: false,
        hasSystemAudio: true,
        hasMicAudio: false,
        hasAudio: true,
        normalizeAllEnabled: false,
      },
      global: { stubs },
    });

    const row = wrapper.get('.normalize-all-row');
    const optionsGroup = wrapper.get('.options-group');
    expect(optionsGroup.element.lastElementChild).toBe(row.element);

    const switchButton = row.get('.switch-stub');
    expect(switchButton.attributes('aria-checked')).toBe('false');
    await switchButton.trigger('click');
    expect(wrapper.emitted('update:normalizeAll')).toEqual([[true]]);

    await wrapper.setProps({ normalizeAllEnabled: true });
    expect(switchButton.attributes('aria-checked')).toBe('true');
    await switchButton.trigger('click');
    expect(wrapper.emitted('update:normalizeAll')).toEqual([[true], [false]]);
  });

  it('shows pending normalization as checked and disabled', () => {
    const wrapper = mount(AudioPanel, {
      props: {
        volume: 100,
        isSystemAudioEnabled: true,
        isMicAudioEnabled: false,
        hasSystemAudio: true,
        hasMicAudio: false,
        normalizeAllPending: true,
      },
      global: { stubs },
    });

    const switchButton = wrapper.get('.normalize-all-row .switch-stub');
    expect(switchButton.attributes('aria-checked')).toBe('true');
    expect(switchButton.attributes('disabled')).toBeDefined();
  });

  it('disables the global normalization switch without eligible audio', () => {
    const wrapper = mount(AudioPanel, {
      props: {
        volume: 100,
        isSystemAudioEnabled: false,
        isMicAudioEnabled: false,
        hasSystemAudio: false,
        hasMicAudio: false,
        hasAudio: false,
      },
      global: { stubs },
    });

    expect(wrapper.get('.normalize-all-row .switch-stub').attributes('disabled')).toBeDefined();
  });
});
