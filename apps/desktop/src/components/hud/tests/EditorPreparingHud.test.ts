import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditorPreparingHud from '../EditorPreparingHud.vue';
import Beamy from '~/components/brand/Beamy/Beamy.vue';
import Throbber from '~/ui/throbber/Throbber.vue';
import type { EditorLoadingProgress } from '~/api/types/editor-window';
const wrappers: ReturnType<typeof mount>[] = [];
const setup = (progress: { progress: EditorLoadingProgress }) => {
  const wrapper = mount(EditorPreparingHud, { props: progress });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('editor preparation', () => {
  it('shows one live status, a loading mascot and a ghost cancel action', async () => {
    const wrapper = setup({ progress: { stage: 'openingWindow', value: 10 } });
    expect(wrapper.findAllComponents(Throbber)).toHaveLength(1);
    expect(wrapper.findAll('[role="status"]')).toHaveLength(1);
    expect(wrapper.getComponent(Beamy).props('phase')).toBe('loading');
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite');
    expect(wrapper.getComponent(Throbber).props('text')).toBe('Let’s get your editor ready');
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([[]]);
    wrapper.unmount();
  });
  it('switches to almost there only at the final confirmed stages', async () => {
    const wrapper = setup({ progress: { stage: 'loadingProject', value: 32 } });
    expect(wrapper.text()).not.toContain('Almost there');
    await wrapper.setProps({
      progress: { stage: 'loadingPreview', value: 90 },
    });
    expect(wrapper.getComponent(Throbber).props('text')).toBe('Almost there!');
    wrapper.unmount();
  });
  it('handles Escape, respects consumed keys and removes its keyboard listener', () => {
    const removal = vi.spyOn(window, 'removeEventListener');
    const wrapper = setup({ progress: { stage: 'openingWindow', value: 10 } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const consumed = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    consumed.preventDefault();
    window.dispatchEvent(consumed);
    expect(wrapper.emitted('cancel')).toBeUndefined();
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted('cancel')).toEqual([[]]);
    wrapper.unmount();
    expect(removal).toHaveBeenCalledWith('keydown', expect.any(Function));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
});
