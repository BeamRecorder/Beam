import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PropertiesLockGuard from './PropertiesLockGuard.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (component: string) => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (component === 'TimelineTracks' && key === 'lockedMessage') {
        return `${String(params?.name ?? '')} is locked. Modifications are not possible.`;
      }
      if (component === 'TimelineTracks' && key === 'unlock') return 'Unlock';
      return `${component}.${key}`;
    },
  }),
}));

const mountGuard = (locked: boolean, name = 'Screen recording') =>
  mount(PropertiesLockGuard, {
    props: { locked, name },
    slots: {
      default: () => h('button', { 'data-testid': 'control' }, 'Edit clip'),
    },
  });

describe('PropertiesLockGuard', () => {
  it('blurs and disables the slot while showing the translated lock message', () => {
    const wrapper = mountGuard(true, 'Screen recording');
    const content = wrapper.get('.properties-lock-content');

    expect(content.classes()).toContain('is-locked');
    expect(content.attributes('inert')).toBe('true');
    expect(content.attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-testid="control"]').text()).toBe('Edit clip');
    expect(wrapper.get('.properties-lock-message').text()).toContain(
      'Screen recording is locked. Modifications are not possible.',
    );
    expect(wrapper.get('.properties-lock-message button').text()).toBe('Unlock');
  });

  it('emits unlock from the native unlock button', async () => {
    const wrapper = mountGuard(true);

    await wrapper.get('.properties-lock-message button').trigger('click');

    expect(wrapper.emitted('unlock')).toEqual([[]]);
  });

  it('keeps the slot active and hides the lock overlay when unlocked', () => {
    const wrapper = mountGuard(false);
    const content = wrapper.get('.properties-lock-content');

    expect(content.classes()).not.toContain('is-locked');
    expect(content.attributes('inert')).toBe('false');
    expect(content.attributes('aria-hidden')).toBeUndefined();
    expect(wrapper.get('[data-testid="control"]').isVisible()).toBe(true);
    expect(wrapper.find('.properties-lock-message').exists()).toBe(false);
    expect(wrapper.find('.properties-lock-message button').exists()).toBe(false);
  });
});
