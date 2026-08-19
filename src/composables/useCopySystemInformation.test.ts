import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { CaptureCatalog } from '~/api/types/capture-api';
import { latestCaptureCatalog, rememberCaptureCatalog } from '~/api/capture-diagnostics';

const capture = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  platform: 'darwin',
  discover: vi.fn(),
  inputAccessStatus: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import { buildSystemInformation, useCopySystemInformation } from './useCopySystemInformation';

let clipboardWriteText: ReturnType<typeof vi.fn>;
let execCommand: ReturnType<typeof vi.fn>;

const linuxCatalog = (recordingAvailable = true): CaptureCatalog => ({
  sources: [],
  capabilities: {},
  limitations: [],
  diagnostics: {
    platform: 'linux',
    linux: {
      distribution: 'Debian GNU/Linux 13 (trixie)',
      distributionId: 'debian',
      distributionLike: [],
      distributionVersion: '13',
      kernel: '6.12.0-amd64',
      architecture: 'x86_64',
      desktop: 'GNOME',
      sessionType: 'x11',
      displayServer: 'X11',
      backend: 'xdg-portal-pipewire',
      portal: {
        available: true,
        errorCode: null,
        detail: null,
        version: 5,
        monitor: true,
        window: true,
        metadataCursor: true,
      },
      pipewire: { available: true, errorCode: null, detail: null },
      ffmpeg: {
        available: recordingAvailable,
        errorCode: recordingAvailable ? null : 'ffmpeg-encoder-unavailable',
        detail: recordingAvailable ? null : 'Install an FFmpeg build with H.264 support',
        encoder: recordingAvailable ? 'libx264' : null,
        codec: recordingAvailable ? 'h264' : null,
        hardware: false,
      },
      recordingAvailable,
    },
  },
});

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
  capture.platform = 'darwin';
  capture.getUpdateState.mockResolvedValue({ currentVersion: '4.2.0' });
  capture.discover.mockResolvedValue(linuxCatalog());
  capture.inputAccessStatus.mockResolvedValue({
    state: 'available',
    canRequest: false,
    clicks: true,
    shortcuts: true,
    recordsText: false,
  });
  rememberCaptureCatalog(null);
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

  it('includes Linux runtime requirements and environment details', () => {
    const information = buildSystemInformation('9.4.1', linuxCatalog(), {
      state: 'available',
      canRequest: false,
      clicks: true,
      shortcuts: true,
      recordsText: false,
    });

    expect(information).toContain('--- Linux Runtime ---');
    expect(information).toContain('Distribution: Debian GNU/Linux 13 (trixie)');
    expect(information).toContain('Distribution ID: debian');
    expect(information).toContain('Distribution Version: 13');
    expect(information).toContain('Distribution Like: None reported');
    expect(information).toContain('Session Type: x11');
    expect(information).toContain('XDG ScreenCast Portal: Yes (v5, monitor, window, cursor metadata)');
    expect(information).toContain('PipeWire: Yes');
    expect(information).toContain('FFmpeg: Yes (libx264, h264, software)');
    expect(information).toContain('Recording Available: Yes');
    expect(information).toContain('Interaction Access: available (clicks=Yes, shortcuts=Yes)');
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

  it('uses the cached Linux catalog without probing again when copying', async () => {
    capture.platform = 'linux';
    rememberCaptureCatalog(linuxCatalog());
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(capture.discover).not.toHaveBeenCalled();
    expect(capture.inputAccessStatus).toHaveBeenCalledOnce();
    expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('Capture Backend: xdg-portal-pipewire'));
    wrapper.unmount();
  });

  it('falls back to discovery and caches the catalog when no Linux snapshot exists', async () => {
    capture.platform = 'linux';
    const catalog = linuxCatalog();
    capture.discover.mockResolvedValueOnce(catalog);
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(capture.discover).toHaveBeenCalledOnce();
    expect(latestCaptureCatalog()).toEqual(catalog);
    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Distribution: Debian GNU/Linux 13 (trixie)'),
    );
    wrapper.unmount();
  });

  it('still copies browser diagnostics when Linux discovery and input access fail', async () => {
    capture.platform = 'linux';
    capture.discover.mockRejectedValueOnce(new Error('portal unavailable'));
    capture.inputAccessStatus.mockRejectedValueOnce(new Error('input access unavailable'));
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining('App Version: 4.2.0'));
    expect(clipboardWriteText).toHaveBeenCalledWith(expect.not.stringContaining('--- Linux Runtime ---'));
    expect(state.copied.value).toBe(true);
    wrapper.unmount();
  });

  it('includes the unavailable Linux requirement detail in the copied report', async () => {
    capture.platform = 'linux';
    rememberCaptureCatalog(linuxCatalog(false));
    const { wrapper, state } = mountCopySystemInformation();

    await state.copy();

    expect(clipboardWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Linux Requirement Issues:\n- Install an FFmpeg build with H.264 support'),
    );
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
