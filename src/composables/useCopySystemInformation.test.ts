import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const capture = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import { buildSystemInformation, useCopySystemInformation } from './useCopySystemInformation';

let clipboardWriteText: ReturnType<typeof vi.fn>;
let execCommand: ReturnType<typeof vi.fn>;

const mountCopySystemInformation = () => {
  let state!: ReturnType<typeof useCopySystemInformation>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useCopySystemInformation();
        return () => h('div');
      },
    }),
  );
  return { wrapper, state };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  capture.getUpdateState.mockResolvedValue({ currentVersion: '4.2.0' });
  clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  execCommand = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildSystemInformation', () => {
  it('includes the supplied app version and browser diagnostics', () => {
    const information = buildSystemInformation('9.4.1');

    expect(information).toContain('=== Beam System Info ===');
    expect(information).toContain('App Version: 9.4.1');
    expect(information).toContain(`Platform: ${navigator.platform || 'Unknown'}`);
    expect(information).toContain(`User Agent: ${navigator.userAgent}`);
    expect(information).toContain(`Language: ${navigator.language}`);
    expect(information).toContain('Screen Resolution:');
    expect(information).toContain('Viewport:');
    expect(information).toContain('Timezone:');
    expect(information).toContain('Date:');
    expect(information).toContain('================================');
  });
});

describe('useCopySystemInformation', () => {
  it('copies diagnostics with the current app version and resets copied state', async () => {
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(capture.getUpdateState).toHaveBeenCalledOnce();
    expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('App Version: 4.2.0'));
    expect(state.copied.value).toBe(true);
    vi.advanceTimersByTime(1_999);
    expect(state.copied.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.copied.value).toBe(false);
    wrapper.unmount();
  });

  it('replaces the previous copied reset timer on repeated copies', async () => {
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();
    vi.advanceTimersByTime(1_000);
    await state.copy();
    vi.advanceTimersByTime(1_000);
    expect(state.copied.value).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(state.copied.value).toBe(false);
    expect(clipboardWriteText).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('uses Unknown when the update state is unavailable or has no version', async () => {
    capture.getUpdateState.mockRejectedValueOnce(new Error('update state unavailable'));
    const first = mountCopySystemInformation();
    await first.state.copy();
    expect(clipboardWriteText).toHaveBeenLastCalledWith(expect.stringContaining('App Version: Unknown'));
    first.wrapper.unmount();

    capture.getUpdateState.mockResolvedValueOnce({ currentVersion: '' });
    const second = mountCopySystemInformation();
    await second.state.copy();
    expect(clipboardWriteText).toHaveBeenLastCalledWith(expect.stringContaining('App Version: Unknown'));
    second.wrapper.unmount();
  });

  it('falls back to a hidden textarea when the Clipboard API rejects', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(clipboardWriteText).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(state.copied.value).toBe(true);
    wrapper.unmount();
  });

  it('does not mark copy successful when both clipboard paths fail', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    execCommand.mockReturnValueOnce(false);
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(clipboardWriteText).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(state.copied.value).toBe(false);
    wrapper.unmount();
  });

  it('removes the fallback textarea when execCommand throws', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    execCommand.mockImplementationOnce(() => {
      throw new Error('copy command failed');
    });
    const { wrapper, state } = mountCopySystemInformation();

    await expect(state.copy()).rejects.toThrow('copy command failed');

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(state.copied.value).toBe(false);
    wrapper.unmount();
  });

  it('clears the copied reset timer when the composable owner unmounts', async () => {
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();
    wrapper.unmount();
    vi.advanceTimersByTime(2_000);

    expect(state.copied.value).toBe(true);
  });
});
