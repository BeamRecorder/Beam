import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CopyButton from './CopyButton.vue';

const clipboardWriteText = vi.fn<(value: string) => Promise<void>>();
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWriteText } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else Reflect.deleteProperty(document, 'execCommand');
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
      expect(button.attributes('title')).toBeUndefined();
      expect(wrapper.find('.tooltip-wrapper').exists()).toBe(true);
    } else {
      expect(button.text()).toContain(label);
    }
  });

  it('uses matching native title and accessible labels for an icon button through copied and error states', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    let resolveCopy!: () => void;
    clipboardWriteText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    const wrapper = mount(CopyButton, {
      props: {
        text: 'diagnostic details',
        display: 'icon',
        label: 'Copy diagnostic details',
        copiedLabel: 'Diagnostic details copied',
        errorLabel: 'Copy failed',
        tooltipMode: 'native',
      },
    });
    const button = wrapper.get('button');
    const expectNativeLabel = (label: string) => {
      expect(button.attributes('title')).toBe(label);
      expect(button.attributes('aria-label')).toBe(label);
      expect(wrapper.find('.tooltip-wrapper').exists()).toBe(false);
      expect(document.querySelector('.tooltip-content')).toBeNull();
    };

    expectNativeLabel('Copy diagnostic details');
    await button.trigger('click');
    expectNativeLabel('Copy diagnostic details');
    expect(button.attributes('data-state')).toBe('copying');
    resolveCopy();
    await flushPromises();
    expectNativeLabel('Diagnostic details copied');

    clipboardWriteText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await button.trigger('click');
    await flushPromises();
    expectNativeLabel('Copy failed');
    expect(button.attributes('data-state')).toBe('error');

    wrapper.unmount();
  });

  it('uses the same native title and accessible name for text presentation', () => {
    const wrapper = mount(CopyButton, {
      props: {
        text: 'diagnostic details',
        display: 'text',
        label: 'Copy diagnostic details',
        tooltipMode: 'native',
      },
    });
    const button = wrapper.get('button');

    expect(button.text()).toContain('Copy diagnostic details');
    expect(button.attributes('title')).toBe('Copy diagnostic details');
    expect(button.attributes('aria-label')).toBe('Copy diagnostic details');
    expect(wrapper.find('.tooltip-wrapper').exists()).toBe(false);

    wrapper.unmount();
  });

  it('resets the copied state and native title when the source text changes', async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    const wrapper = mount(CopyButton, {
      props: {
        text: 'first diagnostic',
        display: 'icon',
        label: 'Copy diagnostics',
        copiedLabel: 'Diagnostics copied',
        tooltipMode: 'native',
      },
    });
    const button = wrapper.get('button');

    await button.trigger('click');
    await flushPromises();
    expect(button.attributes('data-state')).toBe('copied');
    expect(button.attributes('title')).toBe('Diagnostics copied');

    await wrapper.setProps({ text: 'second diagnostic' });
    expect(button.attributes('data-state')).toBe('idle');
    expect(button.attributes('title')).toBe('Copy diagnostics');
    expect(button.attributes('aria-label')).toBe('Copy diagnostics');
    wrapper.unmount();
  });

  it('uses a selected temporary textarea when the Clipboard API is unavailable', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommand,
    });
    vi.stubGlobal('navigator', {});
    const wrapper = mount(CopyButton, {
      props: {
        text: 'fallback diagnostic text',
        display: 'icon',
        label: 'Copy diagnostics',
        copiedLabel: 'Diagnostics copied',
        tooltipMode: 'native',
      },
    });
    const button = wrapper.get('button');

    await button.trigger('click');
    await flushPromises();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(button.attributes('data-state')).toBe('copied');
    expect(button.attributes('title')).toBe('Diagnostics copied');
    wrapper.unmount();
  });

  it('normalizes non-Error copy rejections into the native error label', async () => {
    clipboardWriteText.mockRejectedValueOnce('clipboard permission denied');
    const wrapper = mount(CopyButton, {
      props: {
        text: 'diagnostic details',
        display: 'icon',
        label: 'Copy diagnostics',
        errorLabel: 'Could not copy diagnostics',
        tooltipMode: 'native',
      },
    });
    const button = wrapper.get('button');

    await button.trigger('click');
    await flushPromises();

    expect(button.attributes('data-state')).toBe('error');
    expect(button.attributes('title')).toBe('Could not copy diagnostics');
    expect(button.attributes('aria-label')).toBe('Could not copy diagnostics');
    wrapper.unmount();
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
