import { defineComponent, ref, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { capture } = vi.hoisted(() => ({ capture: { audioLevels: vi.fn() } }));
vi.mock('../../../api/capture', () => ({ capture }));
import { useNativeSystemAudioPreview } from './useNativeSystemAudioPreview';
beforeEach(() => {
  vi.useFakeTimers();
  capture.audioLevels.mockReset().mockResolvedValue({ systemAudio: { peak: 0.7 }, microphone: { peak: 0.2 } });
});
afterEach(() => vi.useRealTimers());
function setup(initial = true) {
  const enabled = ref(initial);
  let meter!: ReturnType<typeof useNativeSystemAudioPreview>;
  const wrapper = mount(
    defineComponent({
      setup() {
        meter = useNativeSystemAudioPreview(enabled);
        return () => h('div');
      },
    }),
  );
  return {
    wrapper,
    enabled,
    get level() {
      return meter.level.value;
    },
  };
}
it('reads existing native streams, clamps levels and stops on disable/unmount', async () => {
  const f = setup();
  await flushPromises();
  expect(f.level).toBe(0.7);
  capture.audioLevels.mockResolvedValue({ systemAudio: { peak: 1.4 } });
  await vi.advanceTimersByTimeAsync(200);
  expect(f.level).toBe(1);
  capture.audioLevels.mockResolvedValue({ systemAudio: { peak: -1 } });
  await vi.advanceTimersByTimeAsync(200);
  expect(f.level).toBe(0);
  f.enabled.value = false;
  await flushPromises();
  const count = capture.audioLevels.mock.calls.length;
  await vi.advanceTimersByTimeAsync(400);
  expect(capture.audioLevels).toHaveBeenCalledTimes(count);
  expect(f.level).toBe(0);
  f.wrapper.unmount();
});
it('does not overlap requests and ignores a late response after disabling', async () => {
  let resolve: (value: unknown) => void = () => {};
  capture.audioLevels.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const f = setup();
  await vi.advanceTimersByTimeAsync(600);
  expect(capture.audioLevels).toHaveBeenCalledOnce();
  f.enabled.value = false;
  await flushPromises();
  resolve({ systemAudio: { peak: 0.8 } });
  await flushPromises();
  expect(f.level).toBe(0);
  f.wrapper.unmount();
});
it('keeps disabled preview idle and reports zero when the native stream disappears', async () => {
  const f = setup(false);
  await vi.advanceTimersByTimeAsync(400);
  expect(capture.audioLevels).not.toHaveBeenCalled();
  capture.audioLevels.mockRejectedValue(new Error('stream lost'));
  f.enabled.value = true;
  await flushPromises();
  expect(f.level).toBe(0);
  f.wrapper.unmount();
});
