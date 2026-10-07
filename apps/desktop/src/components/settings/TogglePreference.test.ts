import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import { defineComponent } from 'vue';
import TogglePreference from './TogglePreference.vue';
it('labels the switch and associates its description with the real button', async () => {
  const wrapper = mount(TogglePreference, {
    props: { modelValue: false, label: 'Option', description: 'Explanation' },
  });
  const toggle = wrapper.get('[role="switch"]');
  expect(toggle.attributes('aria-label')).toBe('Option');
  expect(wrapper.get('p').attributes('id')).toBe(toggle.attributes('aria-describedby'));
  await toggle.trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  wrapper.unmount();
});
it('omits missing help and prevents disabled changes', async () => {
  const wrapper = mount(TogglePreference, {
    props: { modelValue: true, label: 'Option', disabled: true },
  });
  expect(wrapper.find('p').exists()).toBe(false);
  expect(wrapper.get('[role="switch"]').attributes('aria-describedby')).toBeUndefined();
  await wrapper.get('[role="switch"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  expect(wrapper.classes()).toContain('is-disabled');
  wrapper.unmount();
});
it('restores the label and switch together when a preference becomes available', async () => {
  const wrapper = mount(TogglePreference, { props: { modelValue: false, label: 'Option', disabled: true } });
  expect(wrapper.classes()).toContain('is-disabled');
  await wrapper.setProps({ disabled: false });
  expect(wrapper.classes()).not.toContain('is-disabled');
  await wrapper.get('[role="switch"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  wrapper.unmount();
});
it('keeps its label available during a save and blocks changes until it finishes', async () => {
  const wrapper = mount(TogglePreference, { props: { modelValue: false, label: 'Option', busy: true } });
  const toggle = wrapper.get('[role="switch"]');
  expect(wrapper.classes()).not.toContain('is-disabled');
  expect(toggle.attributes('aria-busy')).toBe('true');
  expect(toggle.attributes('disabled')).toBeDefined();
  await wrapper.get('.switch-container').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  await wrapper.setProps({ busy: false, modelValue: true });
  expect(wrapper.classes()).not.toContain('is-disabled');
  expect(toggle.attributes('disabled')).toBeUndefined();
  expect(toggle.attributes('aria-checked')).toBe('true');
  await toggle.trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  wrapper.unmount();
});
it('keeps a reusable info slot and unique descriptions when used twice', () => {
  const wrapper = mount(
    defineComponent({
      components: { TogglePreference },
      template:
        '<div><TogglePreference :model-value="false" label="A" description="Help"><template #info><button>Info</button></template></TogglePreference><TogglePreference :model-value="true" label="B" description="More" /></div>',
    }),
  );
  expect(wrapper.get('.preference-label').text()).toContain('Info');
  const paragraphs = wrapper.findAll('p');
  expect(paragraphs[0]!.attributes('id')).not.toBe(paragraphs[1]!.attributes('id'));
  wrapper.unmount();
});
