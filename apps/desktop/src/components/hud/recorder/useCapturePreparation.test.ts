import { defineComponent, nextTick, watch } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapturePreparation } from './useCapturePreparation';

const capture = vi.hoisted(() => ({
  configureCameraOverlay: vi.fn(),
  setWindowMode: vi.fn(),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
  preparation: {
    configure: vi.fn().mockResolvedValue(undefined),
    onChanged: vi.fn().mockReturnValue(() => {}),
    close: vi.fn(),
  },
  showHud: vi.fn(),
  cancelRegionSelection: vi.fn(),
  onWindowVisibility: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

const request = (countdownSeconds = 3) => ({
  settings: {
    cameraId: 'off',
    microphoneId: 'no-audio',
    systemAudio: false,
    countdownSeconds,
    hideTaskbar: false,
    hideDesktopIcons: false,
    showRealCursor: false,
  },
});
let wrapper: VueWrapper;
let api: ReturnType<typeof useCapturePreparation>;
let visibility: (visible: boolean) => void;
const unsubscribe = vi.fn();
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const render = () => {
  wrapper = mount(
    defineComponent({
      setup() {
        api = useCapturePreparation();
        return () => null;
      },
    }),
  );
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  capture.setWindowMode.mockImplementation(() => {});
  capture.cancelRegionSelection.mockResolvedValue(undefined);
  capture.onWindowVisibility.mockImplementation((listener) => {
    visibility = listener;
    return unsubscribe;
  });
  render();
});
afterEach(() => {
  wrapper.unmount();
  vi.useRealTimers();
});

describe('manual capture preparation', () => {
  it.each([0, 3, 10])('waits indefinitely with a %ss countdown, including Off', async (seconds) => {
    const start = vi.fn().mockResolvedValue(undefined);
    const operation = api.run(request(seconds), start);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(start).not.toHaveBeenCalled();
    expect(api.countdownSeconds.value).toBe(seconds);
    expect(api.active.value).toBe(true);
    expect(api.blocking.value).toBe(true);
    expect(capture.setWindowMode).toHaveBeenCalledExactlyOnceWith('preparation');
    api.confirm();
    await operation;
    expect(start).toHaveBeenCalledOnce();
    expect(capture.showHud).not.toHaveBeenCalled();
    expect(api.active.value).toBe(false);
  });
  it('releases the normal-recording guard before handing off to Instant and keeps the bar busy until acceptance', async () => {
    const pending = deferred();
    const start = vi.fn(async () => {
      expect(api.blocking.value).toBe(false);
      expect(api.active.value).toBe(true);
      expect(api.waiting.value).toBe(false);
      await pending.promise;
    });
    const operation = api.run(request(3), start);
    api.confirm();
    await flushPromises();
    expect(start).toHaveBeenCalledOnce();
    expect(api.active.value).toBe(true);
    api.confirm();
    api.cancel();
    pending.resolve();
    await operation;
    expect(start).toHaveBeenCalledOnce();
  });
  it('cancels without invoking capture and holds ownership until retained-source cleanup finishes', async () => {
    const pending = deferred();
    capture.cancelRegionSelection.mockReturnValue(pending.promise);
    const start = vi.fn();
    const operation = api.run(request(3), start);
    api.cancel();
    api.confirm();
    await flushPromises();
    expect(start).not.toHaveBeenCalled();
    expect(api.blocking.value).toBe(true);
    expect(capture.showHud).not.toHaveBeenCalled();
    pending.resolve();
    await operation;
    expect(capture.showHud).toHaveBeenCalledOnce();
    expect(api.active.value).toBe(false);
  });
  it('does not let concurrent requests replace the pending source or countdown', async () => {
    const first = vi.fn().mockResolvedValue(undefined),
      second = vi.fn();
    const operation = api.run(request(3), first);
    await api.run(request(10), second);
    expect(api.countdownSeconds.value).toBe(3);
    api.confirm();
    await operation;
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });
  it('allows a fresh selection after cancellation', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const first = api.run(request(3), start);
    api.cancel();
    await first;
    const second = api.run(request(5), start);
    api.confirm();
    await second;
    expect(start).toHaveBeenCalledOnce();
    expect(api.countdownSeconds.value).toBe(5);
  });
  it('ignores confirmation and cancellation without a pending selection', () => {
    api.confirm();
    api.cancel();
    expect(capture.showHud).not.toHaveBeenCalled();
    expect(capture.cancelRegionSelection).not.toHaveBeenCalled();
    expect(api.waiting.value).toBe(false);
  });
  it('surfaces source cleanup failure and restores a usable HUD', async () => {
    capture.cancelRegionSelection.mockRejectedValue(new Error('Portal release failed'));
    const operation = api.run(request(3), vi.fn());
    const rejected = expect(operation).rejects.toThrow('Portal release failed');
    api.cancel();
    await rejected;
    expect(capture.showHud).toHaveBeenCalledOnce();
    expect(api.active.value).toBe(false);
  });
  it('restores the HUD after capture handoff failure', async () => {
    const operation = api.run(request(3), async () => {
      throw new Error('Start failed');
    });
    const rejected = expect(operation).rejects.toThrow('Start failed');
    api.confirm();
    await rejected;
    expect(capture.showHud).toHaveBeenCalledOnce();
    expect(api.blocking.value).toBe(false);
  });
  it('recovers if native placement fails before confirmation', async () => {
    capture.setWindowMode.mockImplementationOnce(() => {
      throw new Error('Window unavailable');
    });
    await expect(api.run(request(3), vi.fn())).rejects.toThrow('Window unavailable');
    expect(api.active.value).toBe(false);
    expect(capture.showHud).toHaveBeenCalledOnce();
  });
  it('cancels a hidden preparation without reopening a window the user hid', async () => {
    visibility(false);
    const start = vi.fn();
    const operation = api.run(request(3), start);
    visibility(true);
    visibility(false);
    await operation;
    expect(start).not.toHaveBeenCalled();
    expect(capture.cancelRegionSelection).toHaveBeenCalledOnce();
    expect(capture.showHud).not.toHaveBeenCalled();
  });
  it('ignores visibility changes after the handoff starts', async () => {
    const pending = deferred();
    const operation = api.run(request(3), async () => {
      await pending.promise;
    });
    api.confirm();
    await flushPromises();
    visibility(false);
    pending.resolve();
    await operation;
    expect(capture.cancelRegionSelection).not.toHaveBeenCalled();
  });
  it('releases a pending source on renderer disposal without starting capture or reopening the HUD', async () => {
    const start = vi.fn();
    const operation = api.run(request(3), start);
    wrapper.unmount();
    await operation;
    await api.run(request(3), start);
    expect(start).not.toHaveBeenCalled();
    expect(capture.showHud).not.toHaveBeenCalled();
    expect(capture.cancelRegionSelection).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not touch a source already handed off when its renderer is disposed', async () => {
    const pending = deferred();
    const start = vi.fn(() => pending.promise);
    const operation = api.run(request(3), start);
    api.confirm();
    await flushPromises();
    wrapper.unmount();
    pending.resolve();
    await operation;
    expect(start).toHaveBeenCalledOnce();
    expect(capture.cancelRegionSelection).not.toHaveBeenCalled();
  });
  it('does not start if disposal happens during the guard handoff', async () => {
    const start = vi.fn();
    const operation = api.run(request(3), start);
    const stop = watch(
      api.blocking,
      (value) => {
        if (!value) wrapper.unmount();
      },
      { flush: 'sync' },
    );
    api.confirm();
    await operation;
    stop();
    expect(start).not.toHaveBeenCalled();
    expect(capture.showHud).not.toHaveBeenCalled();
  });
  it('does not reopen after disposal during source cleanup', async () => {
    const pending = deferred();
    capture.cancelRegionSelection.mockReturnValue(pending.promise);
    const operation = api.run(request(3), vi.fn());
    api.cancel();
    await nextTick();
    wrapper.unmount();
    pending.resolve();
    await operation;
    expect(capture.showHud).not.toHaveBeenCalled();
  });
  it('reports a retained-source release failure during renderer disposal without waking the HUD', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    capture.cancelRegionSelection.mockRejectedValueOnce(new Error('Release failed'));
    const operation = api.run(request(3), vi.fn());
    wrapper.unmount();
    await operation;
    await flushPromises();
    expect(log).toHaveBeenCalledWith('Failed to release the prepared capture source:', expect.any(Error));
    expect(capture.showHud).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('does not reopen the HUD when an in-flight handoff rejects after disposal', async () => {
    let reject!: (error: Error) => void;
    const operation = api.run(
      request(3),
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const rejected = expect(operation).rejects.toThrow('Late failure');
    api.confirm();
    await flushPromises();
    wrapper.unmount();
    reject(new Error('Late failure'));
    await rejected;
    expect(capture.showHud).not.toHaveBeenCalled();
  });
});
it('starts with the latest device and quick settings values, persisting them before handoff', async () => {
  const next = {
    ...request(10).settings,
    cameraId: 'camera-new',
    microphoneId: 'mic-new',
    systemAudio: true,
    zoomMode: '3d' as const,
  };
  const start = vi.fn(async (settings) => {
    expect(capture.updatePreferences).toHaveBeenCalled();
    expect(settings).toEqual(next);
  });
  const operation = api.run(request(3), start);
  api.update(next);
  api.confirm();
  await operation;
  expect(start).toHaveBeenCalledExactlyOnceWith(next);
  expect(capture.updatePreferences).toHaveBeenLastCalledWith(
    expect.objectContaining({
      devices: { cameraId: 'camera-new', micId: 'mic-new', systemAudioMode: 'on' },
      extras: expect.objectContaining({ recordingCountdownSeconds: 10, recordingZoomMode: '3d' }),
    }),
  );
});
it('receives native settings updates only during the waiting stage', async () => {
  const listener = capture.preparation.onChanged.mock.calls.at(-1)![0];
  listener(request(8).settings);
  expect(api.request.value).toBeNull();
  const start = vi.fn();
  const operation = api.run(request(3), start);
  listener(request(6).settings);
  expect(api.countdownSeconds.value).toBe(6);
  api.confirm();
  listener(request(9).settings);
  await operation;
  expect(start).toHaveBeenCalledWith(request(6).settings);
});
it('never starts after preference persistence fails and restores the HUD', async () => {
  capture.updatePreferences.mockRejectedValueOnce(new Error('Disk full'));
  const start = vi.fn();
  const operation = api.run(request(3), start);
  const rejected = expect(operation).rejects.toThrow('Disk full');
  api.confirm();
  await rejected;
  expect(start).not.toHaveBeenCalled();
  expect(capture.showHud).toHaveBeenCalled();
});
it('restores a usable HUD when native preparation configuration fails', async () => {
  capture.preparation.configure.mockRejectedValueOnce(new Error('Menu initialization failed'));
  const start = vi.fn();
  await expect(api.run(request(3), start)).rejects.toThrow('Menu initialization failed');
  expect(start).not.toHaveBeenCalled();
});
it('releases the retained source once if disposal happens during preference persistence', async () => {
  const pending = deferred();
  capture.updatePreferences.mockReturnValueOnce(pending.promise);
  const start = vi.fn();
  const operation = api.run(request(3), start);
  api.confirm();
  await flushPromises();
  wrapper.unmount();
  pending.resolve();
  await operation;
  expect(start).not.toHaveBeenCalled();
  expect(capture.cancelRegionSelection).toHaveBeenCalledOnce();
});
it('restores the initial camera preview when edited preparation is canceled', async () => {
  const operation = api.run(request(3), vi.fn());
  api.update({ ...request(3).settings, cameraId: 'new-camera' });
  api.cancel();
  await operation;
  expect(capture.configureCameraOverlay).toHaveBeenCalledWith({ cameraId: 'off' });
});
