import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string, params?: { count?: number }) =>
      key === 'selectionAndMore' ? `… et ${params?.count ?? 0} autres` : key,
  }),
}));

import PropertiesSelectionSummary from './PropertiesSelectionSummary.vue';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const names = Array.from({ length: 12 }, (_, index) => `Track ${index + 1}`);

describe('PropertiesSelectionSummary', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: {
        configurable: true,
        get() {
          return this.classList.contains('selection-summary') ? 160 : 0;
        },
      },
      offsetWidth: {
        configurable: true,
        get() {
          if (this.classList.contains('selection-count')) return 30;
          if (this.textContent === ', ') return 8;
          if (this.parentElement?.classList.contains('selection-measurement')) {
            return (this.textContent?.length ?? 0) * 7;
          }
          return 0;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.querySelectorAll('.tooltip-content').forEach((element) => element.remove());
  });

  it('renders the selected names when no overflow is needed', async () => {
    const wrapper = mount(PropertiesSelectionSummary, {
      props: { names: ['Main screen', 'Webcam'] },
    });
    await nextTick();
    await nextTick();

    expect(wrapper.find('.selection-names').text()).toBe('Main screen, Webcam');
    expect(wrapper.find('.tooltip-wrapper .selection-count').exists()).toBe(false);
  });

  it('renders visible names and an overflow badge when the summary is constrained', async () => {
    const wrapper = mount(PropertiesSelectionSummary, { props: { names } });
    await nextTick();
    await nextTick();

    expect(wrapper.find('.selection-names').text()).toBe('Track 1, Track 2');
    expect(wrapper.find('.tooltip-wrapper .selection-count').text()).toBe('+10');
    expect(wrapper.attributes('aria-label')).toBe(names.join(', '));
  });

  it('shows at most ten tooltip names and the localized remainder', async () => {
    const wrapper = mount(PropertiesSelectionSummary, { props: { names } });
    await nextTick();
    await nextTick();
    await wrapper.find('.tooltip-wrapper').trigger('mouseenter');
    await nextTick();

    const tooltip = document.body.querySelector('.selection-tooltip-list');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.querySelectorAll('div')).toHaveLength(11);
    expect(tooltip?.textContent).toContain('Track 1');
    expect(tooltip?.textContent).toContain('Track 10');
    expect(tooltip?.textContent).not.toContain('Track 11');
    expect(tooltip?.textContent).not.toContain('Track 12');
    expect(tooltip?.textContent).toContain('… et 2 autres');

    wrapper.unmount();
  });

  it('counts copied clips with identical names in the summary and tooltip', async () => {
    const copiedNames = Array.from({ length: 12 }, () => 'Screen Recording');
    const wrapper = mount(PropertiesSelectionSummary, { props: { names: copiedNames } });
    await nextTick();
    await nextTick();

    expect(wrapper.find('.selection-count').text()).toBe('+11');
    expect(wrapper.attributes('aria-label')).toBe(copiedNames.join(', '));

    await wrapper.find('.tooltip-wrapper').trigger('mouseenter');
    await nextTick();

    const tooltip = document.body.querySelector('.selection-tooltip-list');
    expect(tooltip?.querySelectorAll('div')).toHaveLength(11);
    expect(tooltip?.textContent?.match(/Screen Recording/g)).toHaveLength(10);
    expect(tooltip?.textContent).toContain('… et 2 autres');

    wrapper.unmount();
  });
});
