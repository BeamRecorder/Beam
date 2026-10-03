import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import ProjectPickerLoading from './ProjectPickerLoading.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';

describe('immediate project picker loading surface', () => {
  it('presents an explicitly named loading state instead of a blank menu', () => {
    const wrapper = mount(ProjectPickerLoading);
    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-label')).toContain('Loading');
    wrapper.unmount();
  });
  it('reserves compact grid space without fabricated projects or interactive cards', () => {
    const wrapper = mount(ProjectPickerLoading);
    expect(wrapper.findAllComponents(Skeleton)).toHaveLength(8);
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.find('.project-card-container').exists()).toBe(false);
    wrapper.unmount();
  });
  it('uses the selected language for the loading announcement', async () => {
    const wrapper = mount(ProjectPickerLoading);
    const english = wrapper.attributes('aria-label');
    await setCurrentLocale('fr');
    expect(wrapper.attributes('aria-label')).not.toBe(english);
    expect(wrapper.attributes('aria-label')).toContain('Chargement');
    wrapper.unmount();
  });
});
