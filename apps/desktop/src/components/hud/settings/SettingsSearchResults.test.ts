import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsSearchResults from './SettingsSearchResults.vue';
import type { SettingsSearchEntry } from './settings-types';

const results: SettingsSearchEntry[] = Array.from({ length: 100 }, (_, index) => ({
  id: String(index),
  view: 'general',
  title: `Setting ${index}`,
  description: 'Description',
  terms: [],
}));

describe('settings search results', () => {
  it('bounds rendered rows, reveals more and resets the limit on a new query', async () => {
    const wrapper = mount(SettingsSearchResults, {
      props: { query: 'setting', results },
    });
    expect(wrapper.findAll('[data-search-result]')).toHaveLength(40);
    expect(wrapper.get('[role="status"]').text()).toBe('100 results');
    const more = () => wrapper.findAll('button').find((button) => button.text() === 'Show more results')!;
    await more().trigger('click');
    expect(wrapper.findAll('[data-search-result]')).toHaveLength(80);
    await more().trigger('click');
    expect(wrapper.findAll('[data-search-result]')).toHaveLength(100);
    expect(wrapper.text()).not.toContain('Show more results');
    await wrapper.setProps({ query: 'new query' });
    expect(wrapper.findAll('[data-search-result]')).toHaveLength(40);
    wrapper.unmount();
  });
  it('emits the selected setting with its category and description', async () => {
    const wrapper = mount(SettingsSearchResults, {
      props: { query: 'setting', results: results.slice(0, 1) },
    });
    expect(wrapper.get('[data-search-result]').text()).toContain('General');
    expect(wrapper.get('[data-search-result]').text()).toContain('Description');
    await wrapper.get('[data-search-result]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[results[0]]]);
    wrapper.unmount();
  });
  it('shows an accessible empty state', () => {
    const wrapper = mount(SettingsSearchResults, {
      props: { query: 'missing', results: [] },
    });
    expect(wrapper.get('[role="status"]').text()).toBe('0 results');
    expect(wrapper.get('.search-empty').text()).toContain('No settings match');
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
});
