import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { RecordingConfiguration } from './recording-types';
const api = vi.hoisted(() => ({
  platform: 'linux',
  prepareRecording: vi.fn(),
  startPreparedRecording: vi.fn(),
  discardRecording: vi.fn(),
  setCountdown: vi.fn(),
  prepareRecordingSurface: vi.fn(),
  setTeleprompterSession: vi.fn(),
  hideScreenRegionOverlay: vi.fn(),
  showScreenRegionOverlay: vi.fn(),
  status: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancelPreparedRecording: vi.fn(),
}));
vi.mock('../../../api/capture', () => ({ capture: api }));
import { useRecordingController } from './useRecordingController';
const config: RecordingConfiguration = {
  screenKind: 'display',
  screenId: 'portal:monitor',
  cameraId: 'native-camera',
  microphoneId: 'native-mic',
  systemAudio: true,
  targetFps: 30,
  countdownSeconds: 0,
  recordingBarVisibility: 'always',
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  api.prepareRecording.mockResolvedValue({ sessionId: 'session', projectId: 'project' });
  api.startPreparedRecording.mockResolvedValue({ sessionId: 'session', projectId: 'project' });
  api.status.mockResolvedValue({
    state: 'recording',
    manifest: {
      tracks: ['screen', 'camera', 'microphone', 'system-audio'].map((kind) => ({ kind, status: 'recording' })),
    },
  });
  api.stop.mockResolvedValue({ sessionId: 'session', manifestPath: '/project/session/manifest.json' });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('prepares all native selections once and uses one start/stop lifecycle', async () => {
  const completed = vi.fn();
  const controller = useRecordingController(completed);
  await controller.start(config);
  await flush();
  expect(api.prepareRecording).toHaveBeenCalledWith(
    expect.objectContaining({ cameraId: 'native-camera', microphoneId: 'native-mic', systemAudio: true }),
  );
  expect(api.startPreparedRecording).toHaveBeenCalledOnce();
  expect(controller.phase.value).toBe('recording');
  expect(controller.cameraEnabled.value).toBe(true);
  await controller.togglePause();
  expect(controller.phase.value).toBe('paused');
  await controller.togglePause();
  expect(controller.phase.value).toBe('recording');
  await controller.stop();
  expect(api.stop).toHaveBeenCalledOnce();
  expect(completed).toHaveBeenCalledOnce();
  expect(controller.phase.value).toBe('idle');
});
it('native picker cancellation does not start or open other recording paths', async () => {
  api.prepareRecording.mockResolvedValue(null);
  const cancelled = vi.fn();
  const controller = useRecordingController(vi.fn(), vi.fn(), cancelled);
  await controller.start(config);
  expect(cancelled).toHaveBeenCalledOnce();
  expect(api.startPreparedRecording).not.toHaveBeenCalled();
  expect(controller.phase.value).toBe('idle');
});
it('cancelling an in-flight prepare disposes its eventual session', async () => {
  let resolve!: (value: unknown) => void;
  api.prepareRecording.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const controller = useRecordingController(vi.fn());
  const start = controller.start(config);
  await controller.cancel();
  resolve({ sessionId: 'late' });
  await start;
  await flush();
  expect(api.discardRecording).toHaveBeenCalledWith('late');
  expect(api.startPreparedRecording).not.toHaveBeenCalled();
});
it('a start failure cleans the armed session and reports the concrete error', async () => {
  api.startPreparedRecording.mockRejectedValue(new Error('native start failed'));
  const failed = vi.fn();
  const controller = useRecordingController(vi.fn(), failed);
  await controller.start(config);
  await flush();
  expect(api.discardRecording).toHaveBeenCalledWith('session');
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'native start failed' }));
});
it('countdown cancellation never starts the prepared recording', async () => {
  const controller = useRecordingController(vi.fn());
  await controller.start({ ...config, countdownSeconds: 3 });
  await controller.cancel();
  await vi.advanceTimersByTimeAsync(4000);
  expect(api.startPreparedRecording).not.toHaveBeenCalled();
  expect(api.discardRecording).toHaveBeenCalledWith('session');
});
it('recovers a finalized manifest when the stop response fails', async () => {
  const completed = vi.fn();
  const controller = useRecordingController(completed);
  await controller.start(config);
  await flush();
  api.stop.mockRejectedValue(new Error('response lost'));
  const final = { state: 'failed', manifestPath: '/project/session/manifest.json' };
  api.status.mockResolvedValue(final);
  await controller.stop();
  expect(controller.phase.value).toBe('idle');
  expect(completed).toHaveBeenCalledWith(final);
  expect(controller.error.value).toContain('response lost');
});
it('keeps a paused session paused after a rejected stop', async () => {
  const controller = useRecordingController(vi.fn());
  await controller.start(config);
  await flush();
  await controller.togglePause();
  api.stop.mockRejectedValue(new Error('temporarily busy'));
  api.status.mockResolvedValue({ state: 'paused' });
  await controller.stop();
  expect(controller.phase.value).toBe('paused');
});
