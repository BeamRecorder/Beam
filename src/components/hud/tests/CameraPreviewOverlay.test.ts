import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { capture } = vi.hoisted(() => ({ capture: { cameraPreview: vi.fn() } }));
vi.mock('../../../api/capture', () => ({ capture }));
import CameraPreviewOverlay from '../camera/CameraPreviewOverlay.vue';
beforeEach(() => {
  vi.useFakeTimers();
  capture.cameraPreview.mockReset();
  capture.cameraPreview.mockResolvedValue('data:image/jpeg;base64,frame');
});
afterEach(() => vi.useRealTimers());
it('renders the native preview and stops polling after unmount', async () => {
  const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'native-camera' } });
  await vi.advanceTimersByTimeAsync(100);
  expect(wrapper.find('img').attributes('src')).toBe('data:image/jpeg;base64,frame');
  wrapper.unmount();
  const calls = capture.cameraPreview.mock.calls.length;
  await vi.advanceTimersByTimeAsync(500);
  expect(capture.cameraPreview).toHaveBeenCalledTimes(calls);
});
it('does not poll disabled cameras and discards results belonging to an earlier selection', async () => {
  let resolve: (value: string) => void = () => {};
  capture.cameraPreview.mockReturnValue(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'off' } });
  await vi.advanceTimersByTimeAsync(200);
  expect(capture.cameraPreview).not.toHaveBeenCalled();
  await wrapper.setProps({ cameraId: 'first' });
  await vi.advanceTimersByTimeAsync(100);
  await wrapper.setProps({ cameraId: 'second' });
  resolve('data:image/jpeg;base64,stale');
  await flushPromises();
  expect(wrapper.find('img').exists()).toBe(false);
  wrapper.unmount();
});
it('keeps at most one preview request in flight and exposes native failure', async () => {
  let reject: (reason: Error) => void = () => {};
  capture.cameraPreview.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const wrapper = mount(CameraPreviewOverlay, { props: { cameraId: 'native' } });
  await vi.advanceTimersByTimeAsync(500);
  expect(capture.cameraPreview).toHaveBeenCalledTimes(1);
  reject(new Error('source lost'));
  await flushPromises();
  expect(wrapper.find('.camera-overlay-error').exists()).toBe(true);
  wrapper.unmount();
});
