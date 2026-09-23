import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { capture } = vi.hoisted(() => ({
  capture: {
    getCameraOverlayState: vi.fn(),
    notifyCameraOverlayReady: vi.fn(),
    onCameraOverlayState: vi.fn(),
    onCameraOverlayHover: vi.fn(),
    status: vi.fn(),
  },
}));
vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('../../../stores/theme', () => ({ useThemeStore: () => ({ theme: 'dark' }) }));
import CameraOverlayApp from '../camera/CameraOverlayApp.vue';
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  capture.getCameraOverlayState.mockResolvedValue({ cameraId: 'native' });
  capture.status.mockResolvedValue({ state: 'recording' });
});
afterEach(() => vi.useRealTimers());
it('observes native state and releases listeners without owning a browser recorder', async () => {
  const stateCleanup = vi.fn(),
    hoverCleanup = vi.fn();
  capture.onCameraOverlayState.mockReturnValue(stateCleanup);
  capture.onCameraOverlayHover.mockReturnValue(hoverCleanup);
  const wrapper = mount(CameraOverlayApp, {
    global: {
      stubs: {
        CameraPreviewOverlay: { name: 'CameraPreviewOverlay', props: ['cameraId', 'isRecording'], template: '<div />' },
      },
    },
  });
  await flushPromises();
  expect(capture.notifyCameraOverlayReady).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(500);
  const preview = wrapper.findComponent({ name: 'CameraPreviewOverlay' });
  expect(preview.props('cameraId')).toBe('native');
  expect(preview.props('isRecording')).toBe(true);
  capture.onCameraOverlayState.mock.calls[0][0]({ cameraId: 'off' });
  await flushPromises();
  expect(preview.props('cameraId')).toBe('off');
  wrapper.unmount();
  expect(stateCleanup).toHaveBeenCalledOnce();
  expect(hoverCleanup).toHaveBeenCalledOnce();
  const calls = capture.status.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(capture.status).toHaveBeenCalledTimes(calls);
});
