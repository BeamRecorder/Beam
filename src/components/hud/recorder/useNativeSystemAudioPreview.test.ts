import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({
  capture: {
    platform: 'linux',
    startSystemAudioPreview: vi.fn(),
    systemAudioPreviewLevel: vi.fn(),
    stopSystemAudioPreview: vi.fn(),
  },
}));

vi.mock('../../../api/capture', () => ({ capture }));

import { useNativeSystemAudioPreview } from './useNativeSystemAudioPreview';

const PreviewHarness = defineComponent({
  props: {
    initiallyEnabled: { type: Boolean, default: false },
  },
  setup(props) {
    const enabled = ref(props.initiallyEnabled);
    const preview = useNativeSystemAudioPreview(enabled);
    const setEnabled = (value: boolean) => {
      enabled.value = value;
    };
    return { enabled, level: preview.level, setEnabled };
  },
  render() {
    return h('div', this.level);
  },
});

const settle = async () => {
  await Promise.resolve();
  await nextTick();
};

const mountPreview = async (initiallyEnabled = false) => {
  const wrapper = mount(PreviewHarness, { props: { initiallyEnabled } });
  await settle();
  return wrapper;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('useNativeSystemAudioPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capture.platform = 'linux';
    capture.startSystemAudioPreview.mockReset().mockResolvedValue(undefined);
    capture.systemAudioPreviewLevel.mockReset().mockResolvedValue(0);
    capture.stopSystemAudioPreview.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the Linux preview, polls every 200ms, and clamps levels', async () => {
    capture.systemAudioPreviewLevel
      .mockResolvedValueOnce(1.4)
      .mockResolvedValueOnce(-0.25);
    const wrapper = await mountPreview(true);

    expect(capture.startSystemAudioPreview).toHaveBeenCalledOnce();
    expect(capture.systemAudioPreviewLevel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(capture.systemAudioPreviewLevel).toHaveBeenCalledOnce();
    expect(wrapper.vm.level).toBe(1);

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(wrapper.vm.level).toBe(0);
    wrapper.unmount();
  });

  it('does not overlap level polls and schedules the next one after completion', async () => {
    const firstLevel = deferred<number>();
    capture.systemAudioPreviewLevel.mockReturnValueOnce(firstLevel.promise).mockResolvedValueOnce(0.25);
    const wrapper = await mountPreview(true);

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(capture.systemAudioPreviewLevel).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(600);
    await settle();
    expect(capture.systemAudioPreviewLevel).toHaveBeenCalledOnce();

    firstLevel.resolve(0.8);
    await settle();
    expect(wrapper.vm.level).toBe(0.8);

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(capture.systemAudioPreviewLevel).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.level).toBe(0.25);
    wrapper.unmount();
  });

  it('stops polling and resets on disable', async () => {
    capture.systemAudioPreviewLevel.mockResolvedValue(0.7);
    const wrapper = await mountPreview(false);
    await wrapper.vm.setEnabled(true);
    await nextTick();
    await settle();
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(wrapper.vm.level).toBe(0.7);

    await wrapper.vm.setEnabled(false);
    await nextTick();
    await settle();
    expect(capture.stopSystemAudioPreview).toHaveBeenCalledOnce();
    expect(wrapper.vm.level).toBe(0);

    const calls = capture.systemAudioPreviewLevel.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(capture.systemAudioPreviewLevel).toHaveBeenCalledTimes(calls);
    wrapper.unmount();
  });

  it('stops the native preview on unmount', async () => {
    const wrapper = await mountPreview(true);
    wrapper.unmount();

    expect(capture.stopSystemAudioPreview).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(capture.systemAudioPreviewLevel).not.toHaveBeenCalled();
  });

  it('ignores a stale level response after the preview is disabled', async () => {
    const staleLevel = deferred<number>();
    capture.systemAudioPreviewLevel.mockReturnValueOnce(staleLevel.promise);
    const wrapper = await mountPreview(true);

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(capture.systemAudioPreviewLevel).toHaveBeenCalledOnce();

    await wrapper.vm.setEnabled(false);
    await nextTick();
    await settle();
    staleLevel.resolve(0.95);
    await settle();

    expect(wrapper.vm.level).toBe(0);
    expect(capture.stopSystemAudioPreview).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('does not call native preview APIs on non-Linux platforms', async () => {
    capture.platform = 'darwin';
    const wrapper = await mountPreview(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    wrapper.unmount();

    expect(capture.startSystemAudioPreview).not.toHaveBeenCalled();
    expect(capture.systemAudioPreviewLevel).not.toHaveBeenCalled();
    expect(capture.stopSystemAudioPreview).not.toHaveBeenCalled();
    expect(wrapper.vm.level).toBe(0);
  });
});
