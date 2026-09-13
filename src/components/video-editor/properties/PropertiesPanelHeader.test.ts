import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PropertiesPanelHeader from './PropertiesPanelHeader.vue';

describe('shared properties header', () => {
  it('hosts screenshot actions without requiring timeline or transition state', () => {
    const wrapper = mount(PropertiesPanelHeader, {
      props: { title: 'Image' },
      slots: { actions: '<button>Crop</button>' },
    });
    expect(wrapper.get('h3').text()).toBe('Image');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Crop']);
    wrapper.unmount();
  });
  it('preserves the Studio canvas transition action when no custom actions are provided', async () => {
    const wrapper = mount(PropertiesPanelHeader, {
      props: { title: 'Canvas', showCanvasTransition: true, transitionButtonLabel: 'Transition' },
    });
    await wrapper.get('[aria-label="Transition"]').trigger('click');
    expect(wrapper.emitted('transition')).toEqual([[]]);
    wrapper.unmount();
  });
  it('preserves the Studio layer actions', async () => {
    const wrapper = mount(PropertiesPanelHeader, {
      props: {
        title: 'Clip',
        showClipActions: true,
        enabled: true,
        toggleable: true,
        enabledLabel: 'Enabled',
        disabledLabel: 'Disabled',
        deleteLabel: 'Delete',
      },
    });
    await wrapper.get('[aria-label="Delete"]').trigger('click');
    expect(wrapper.emitted('delete')).toEqual([[]]);
    wrapper.unmount();
  });
});
