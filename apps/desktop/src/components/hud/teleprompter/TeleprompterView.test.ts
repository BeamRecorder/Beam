import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import TeleprompterView from './TeleprompterView.vue';
import TeleprompterToolbar from './TeleprompterToolbar.vue';
import { createDefaultTeleprompterDocument } from './teleprompter-types';
enableAutoUnmount(afterEach);
const mountView = () =>
  mount(TeleprompterView, {
    props: {
      document: { ...createDefaultTeleprompterDocument(), text: 'First line\nSecond line' },
      editing: true,
      playing: false,
      activeLine: 0,
      error: '',
      defaultTextColor: '#1e1e1e',
    },
  });
describe('TeleprompterView', () => {
  it('renders independently from the native capture API and relays editing and close', async () => {
    const view = mountView();
    await view.get('textarea').setValue('Updated script');
    await view.get('[aria-label="Close"]').trigger('click');
    expect(view.emitted('update')).toEqual([[{ text: 'Updated script' }]]);
    expect(view.emitted('close')).toEqual([[]]);
    expect(view.emitted('display')![0][0]).toBeInstanceOf(HTMLElement);
  });
  it('renders active/past reader lines and the native pause action', async () => {
    const view = mountView();
    await view.setProps({
      editing: false,
      playing: true,
      activeLine: 1,
      document: {
        ...createDefaultTeleprompterDocument(),
        text: 'First line\nSecond line',
        mode: 'line-by-line',
        textAlign: 'center',
      },
    });
    expect(view.find('textarea').exists()).toBe(false);
    expect(view.get('.active').text()).toBe('Second line');
    expect(view.get('.past').text()).toBe('First line');
    expect(view.get('.teleprompter-display').classes()).toContain('is-centered');
    await view.get('[aria-label="Pause"]').trigger('click');
    expect(view.emitted('play')).toEqual([[]]);
  });
  it('relays toolbar intents and preserves errors and empty lines', async () => {
    const view = mountView();
    await view.setProps({
      error: 'Script unavailable',
      document: { ...createDefaultTeleprompterDocument(), text: '' },
    });
    expect(view.get('[role="alert"]').text()).toBe('Script unavailable');
    expect(view.findAll('.teleprompter-line')).toHaveLength(1);
    const toolbar = view.getComponent(TeleprompterToolbar);
    toolbar.vm.$emit('update', { scrollSpeed: 74 });
    toolbar.vm.$emit('reset');
    toolbar.vm.$emit('edit');
    expect(view.emitted('update')).toEqual([[{ scrollSpeed: 74 }]]);
    expect(view.emitted('reset')).toEqual([[]]);
    expect(view.emitted('edit')).toEqual([[]]);
  });
});
