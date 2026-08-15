import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CopyButton from './CopyButton.vue';

const clipboardWriteText = vi.fn<(value: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWriteText } });
});

describe('CopyButton', () => {
  it.each([
    ['icon', 'Copy error'],
    ['text', 'Copy error'],
  ] as const)('renders the %s presentation variant with an accessible label', (variant, label) => {
    const wrapper = mount(CopyButton, {
      props: { text: 'diagnostic details', display: variant, label },
    });
    const button = wrapper.get('button');

    expect(button.attributes('aria-label')).toBe(label);
    if (variant === 'icon') {
      expect(button.find('.btn-icon-wrapper').exists()).toBe(true);
      expect(button.find('svg').classes()).toEqual(expect.arrayContaining(['lucide-copy']));
    } else {
      expect(button.text()).toContain(label);
    }
  });

  it('stays loading while clipboard write is pending and shows success after resolution', async () => {
    let resolveWrite!: () => void;
    clipboardWriteText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const wrapper = mount(CopyButton, {
      props: { text: 'diagnostic details', display: 'text', label: 'Copy error', copiedLabel: 'Copied' },
    });
    const button = wrapper.get('button');

    await button.trigger('click');
    expect(clipboardWriteText).toHaveBeenCalledWith('diagnostic details');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-busy')).toBe('true');
    expect(button.find('.lucide-loader').exists()).toBe(true);
    expect(button.text()).not.toContain('Copied');

    resolveWrite();
    await flushPromises();
    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.attributes('aria-busy')).toBe('false');
    expect(button.text()).toContain('Copied');
    expect(button.find('.lucide-check').exists()).toBe(true);
  });

  it('shows an error after clipboard rejection without claiming success', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    const wrapper = mount(CopyButton, {
      props: {
        text: 'diagnostic details',
        display: 'text',
        label: 'Copy error',
        copiedLabel: 'Copied',
        errorLabel: 'Copy failed',
      },
    });
    const button = wrapper.get('button');

    await button.trigger('click');
    await flushPromises();

    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.attributes('aria-busy')).toBe('false');
    expect(button.text()).toContain('Copy failed');
    expect(button.text()).not.toContain('Copied');
    expect(button.find('.lucide-check').exists()).toBe(false);
  });
});
