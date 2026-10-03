import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PropertiesPanelHeader from './PropertiesPanelHeader.vue';
import { flushPromises } from '@vue/test-utils';

describe('shared properties header', () => {
  it('accepts an editable title without replacing the header actions', () => {
    const wrapper = mount(PropertiesPanelHeader, {
      props: { title: 'Callout' },
      slots: { title: '<button>Callout</button>', actions: '<button>Close</button>' },
    });
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Callout', 'Close']);
    expect(wrapper.find('.panel-title-block').exists()).toBe(false);
    wrapper.unmount();
  });
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
      props: {
        title: 'Canvas',
        showCanvasTransition: true,
        transitionButtonLabel: 'Transition',
      },
    });
    await wrapper.get('[aria-label="Transition"]').trigger('click');
    wrapper.vm.focusTransitionButton();
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
        clipTransitionable: true,
        transitionButtonLabel: 'Transition',
      },
    });
    await wrapper.get('[aria-label="Delete"]').trigger('click');
    await wrapper.get('[aria-label="Enabled"]').trigger('click');
    await wrapper.get('[aria-label="Transition"]').trigger('click');
    wrapper.vm.focusTransitionButton();
    expect(wrapper.emitted('delete')).toEqual([[]]);
    expect(wrapper.emitted('toggle')).toEqual([[]]);
    expect(wrapper.emitted('transition')).toEqual([[]]);
    wrapper.unmount();
  });
  it('preserves transition navigation and the return action despite a custom editable title', async () => {
    const wrapper = mount(PropertiesPanelHeader, {
      props: { title: 'Image', transitionsOpen: true, transitionTitle: 'Transitions' },
      slots: { title: '<button>Editable title</button>' },
    });
    expect(wrapper.get('h3').text()).toBe('Transitions');
    await wrapper.get('[aria-label="Back"]').trigger('click');
    expect(wrapper.emitted('back')).toEqual([[]]);
    wrapper.vm.focusTransitionButton();
    wrapper.unmount();
  });
  it('retains the multi-selection summary with an ordinary title and safely focuses before actions mount', async () => {
    const wrapper = mount(PropertiesPanelHeader, { props: { title: 'Clips', selectionNames: ['A', 'B'] } });
    wrapper.vm.focusTransitionButton();
    expect(wrapper.get('.panel-title-block').text()).toContain('A');
    await flushPromises();
    wrapper.unmount();
  });
});
