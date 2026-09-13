import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTeleprompter } from '../teleprompter/useTeleprompter';
import type { TeleprompterDocument, TeleprompterViewState } from '../teleprompter/teleprompter-types';

const captureMock = vi.hoisted(() => ({
  getSessionTeleprompter: vi.fn(),
  saveSessionTeleprompter: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture: captureMock }));

const session = { projectId: 'project', sessionId: 'session' };
const storedDocument = (): TeleprompterDocument => ({
  schemaVersion: 1,
  text: 'stored one\nstored two',
  mode: 'line-by-line',
  autoscroll: false,
  scrollSpeed: 30,
  fontSize: 40,
  lineHeight: 1.4,
  textAlign: 'center',
  theme: 'dark',
  updatedAtUtc: 'yesterday',
});

describe('useTeleprompter composable', () => {
  let api!: ReturnType<typeof useTeleprompter>;
  let wrapper: ReturnType<typeof mount>;
  let frames: FrameRequestCallback[];

  const mountApi = () =>
    mount(
      defineComponent({
        setup() {
          api = useTeleprompter();
          return () => null;
        },
      }),
    );

  const replaceCaptureMethod = (key: keyof typeof captureMock, value: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(captureMock, key)!;
    Object.defineProperty(captureMock, key, { ...descriptor, value });
    return () => Object.defineProperty(captureMock, key, descriptor);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    captureMock.getSessionTeleprompter.mockResolvedValue(null);
    captureMock.saveSessionTeleprompter.mockResolvedValue(storedDocument());
    captureMock.getPreferences.mockResolvedValue({ extras: {} });
    captureMock.updatePreferences.mockResolvedValue({});
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    wrapper = mountApi();
  });

  afterEach(() => {
    wrapper.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const display = () => {
    const element = document.createElement('section');
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    element.scrollTo = vi.fn();
    return element;
  };

  it('loads a new or stored session and handles persisted errors', async () => {
    await api.applySession(session);
    await flushPromises();
    expect(captureMock.getSessionTeleprompter).toHaveBeenCalledWith('project', 'session');
    expect(captureMock.saveSessionTeleprompter).toHaveBeenCalledWith(
      'project',
      'session',
      expect.objectContaining({ schemaVersion: 1 }),
    );

    captureMock.getSessionTeleprompter.mockResolvedValueOnce(storedDocument());
    await api.applySession(session);
    await flushPromises();
    expect(api.document.value).toEqual({ ...storedDocument(), fontSize: 36 });
    expect(api.lines.value).toEqual(['stored one', 'stored two']);

    captureMock.getSessionTeleprompter.mockRejectedValueOnce(new Error('session unavailable'));
    await api.applySession(session);
    expect(api.error.value).toBe('session unavailable');

    captureMock.getSessionTeleprompter.mockRejectedValueOnce('session unavailable as text');
    await api.applySession(session);
    expect(api.error.value).toBe('session unavailable as text');
    await api.applySession(null);
    expect(api.session.value).toBeNull();
  });

  it('updates and saves the document, handles shortcuts and reports save failures', async () => {
    await api.applySession(session);
    await flushPromises();
    captureMock.saveSessionTeleprompter.mockRejectedValueOnce(new Error('write failed'));
    api.updateDocument({
      text: 'one\ntwo\nthree',
      mode: 'line-by-line',
      autoscroll: true,
    });
    vi.advanceTimersByTime(350);
    await flushPromises();
    expect(api.lines.value).toEqual(['one', 'two', 'three']);
    expect(api.error.value).toBe('write failed');

    api.handleShortcut('teleprompter.nextLine');
    api.handleShortcut('teleprompter.nextLine');
    expect(api.activeLine.value).toBe(2);
    api.handleShortcut('teleprompter.previousLine');
    expect(api.activeLine.value).toBe(1);
    api.handleShortcut('teleprompter.toggleAutoscroll');
    expect(api.document.value.autoscroll).toBe(false);
    api.handleShortcut('unknown');

    captureMock.saveSessionTeleprompter.mockRejectedValueOnce('write failed as text');
    api.updateDocument({ fontSize: 90 });
    expect(api.document.value.fontSize).toBe(36);
    vi.advanceTimersByTime(350);
    await flushPromises();
    expect(api.error.value).toBe('write failed as text');

    api.updateDocument({ fontSize: 8 });
    expect(api.document.value.fontSize).toBe(16);
  });

  it('autoscrolls continuously and by line, scrolls the active line, pauses and resumes', async () => {
    const target = display();
    api.updateDocument({
      text: 'first\nsecond\nthird',
      mode: 'continuous',
      autoscroll: true,
      scrollSpeed: 100,
    });
    api.setDisplayElement(target);
    expect(frames).toHaveLength(1);
    frames.shift()!(100);
    frames.shift()!(200);
    expect(target.scrollTop).toBeGreaterThan(0);

    api.togglePause();
    expect(api.isPaused.value).toBe(true);
    api.togglePause();
    expect(api.isPaused.value).toBe(false);

    api.updateDocument({
      mode: 'line-by-line',
      autoscroll: true,
      scrollSpeed: 200,
    });
    const line = document.createElement('p');
    line.dataset.lineIndex = '1';
    Object.defineProperty(line, 'offsetTop', { configurable: true, value: 80 });
    target.append(line);
    api.setDisplayElement(target);
    expect(target.scrollTo as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    api.nextLine();
    expect(api.activeLine.value).toBe(1);
    expect(target.scrollTo).toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(api.activeLine.value).toBe(2);
    api.previousLine();
    expect(target.scrollTo).toHaveBeenCalled();
  });

  it('does not autoscroll when disabled and saves during unmount cleanup', async () => {
    api.updateDocument({ autoscroll: false });
    api.setDisplayElement(display());
    expect(frames).toHaveLength(0);
    await api.applySession(session);
    await flushPromises();
    wrapper.unmount();
    await flushPromises();
    expect(captureMock.saveSessionTeleprompter).toHaveBeenCalled();
  });

  it('stops animation while hidden and resumes it when the native window becomes visible', () => {
    const target = display();
    api.updateDocument({ mode: 'continuous', autoscroll: true, scrollSpeed: 100 });
    api.setDisplayElement(target);
    expect(frames).toHaveLength(1);

    const pendingFrame = frames.shift()!;
    api.setVisible(false);
    pendingFrame(100);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(frames).toHaveLength(0);

    api.setVisible(true);
    expect(frames).toHaveLength(1);
  });

  it('stops a pending animation immediately when beginning a checkpoint flush', async () => {
    wrapper.unmount();
    let resolvePreferences!: (value: { extras: Record<string, never> }) => void;
    captureMock.getPreferences.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreferences = resolve;
      }),
    );
    wrapper = mountApi();
    api.updateDocument({ mode: 'continuous', autoscroll: true });
    api.setDisplayElement(display());
    expect(frames).toHaveLength(1);
    const pendingFrame = frames.shift()!;

    const checkpoint = api.suspendState();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    pendingFrame(100);
    expect(frames).toHaveLength(0);

    resolvePreferences({ extras: {} });
    await checkpoint;
  });

  it('flushes and restores the full view checkpoint, including session, pause and scroll position', async () => {
    captureMock.getSessionTeleprompter.mockResolvedValueOnce(storedDocument());
    await api.applySession(session);
    await flushPromises();

    const target = display();
    const secondLine = document.createElement('p');
    secondLine.dataset.lineIndex = '1';
    Object.defineProperty(secondLine, 'offsetTop', { configurable: true, value: 160 });
    target.append(secondLine);
    api.updateDocument({ text: 'first\nsecond', mode: 'line-by-line', autoscroll: true, textAlign: 'center' });
    api.setDisplayElement(target);
    api.nextLine();
    target.scrollTop = 320;
    api.togglePause();
    captureMock.saveSessionTeleprompter.mockRejectedValueOnce(new Error('save warning'));

    const checkpoint = await api.suspendState();
    expect(checkpoint).toMatchObject({
      session,
      activeLine: 1,
      scrollTop: 320,
      isEditing: true,
      isPaused: true,
      error: 'save warning',
      document: { text: 'first\nsecond', textAlign: 'center' },
    });
    expect(captureMock.saveSessionTeleprompter).toHaveBeenLastCalledWith(
      session.projectId,
      session.sessionId,
      expect.objectContaining({ text: 'first\nsecond' }),
    );
    expect(captureMock.updatePreferences).toHaveBeenLastCalledWith({
      extras: { teleprompterSettings: expect.objectContaining({ mode: 'line-by-line', textAlign: 'center' }) },
    });

    const typedCheckpoint: TeleprompterViewState = checkpoint;
    api.document.value = { ...api.document.value, text: 'temporary replacement' };
    await api.restoreState(typedCheckpoint);
    expect(api.document.value.text).toBe('first\nsecond');
    expect(api.session.value).toEqual(session);
    expect(api.activeLine.value).toBe(1);
    expect(api.isEditing.value).toBe(true);
    expect(api.isPaused.value).toBe(true);
    expect(api.error.value).toBe('save warning');
    expect(target.scrollTo).toHaveBeenLastCalledWith({ top: 320, behavior: 'instant' });
  });

  it('normalizes valid stored global settings and ignores invalid fields', async () => {
    wrapper.unmount();
    captureMock.getPreferences.mockResolvedValueOnce({
      extras: {
        teleprompterSettings: {
          mode: 'line-by-line',
          autoscroll: false,
          scrollSpeed: 999,
          fontSize: 14.6,
          lineHeight: 3,
          textAlign: 'center',
        },
      },
    });
    wrapper = mountApi();
    await flushPromises();
    expect(api.document.value).toMatchObject({
      mode: 'line-by-line',
      autoscroll: false,
      scrollSpeed: 200,
      fontSize: 16,
      lineHeight: 2.5,
      textAlign: 'center',
    });

    wrapper.unmount();
    captureMock.getPreferences.mockResolvedValueOnce({
      extras: {
        teleprompterSettings: {
          mode: 'unknown',
          autoscroll: 'false',
          scrollSpeed: 'fast',
          fontSize: Number.POSITIVE_INFINITY,
          lineHeight: Number.NaN,
          textAlign: 'right',
        },
      },
    });
    wrapper = mountApi();
    await flushPromises();
    expect(api.document.value).toMatchObject({
      mode: 'continuous',
      autoscroll: true,
      scrollSpeed: 42,
      fontSize: 36,
      lineHeight: 1.35,
      textAlign: 'left',
    });
  });

  it('rejects non-object and array preference values without changing defaults', async () => {
    wrapper.unmount();
    captureMock.getPreferences.mockResolvedValueOnce({ extras: { teleprompterSettings: 'invalid' } });
    wrapper = mountApi();
    await flushPromises();
    expect(api.document.value.mode).toBe('continuous');

    wrapper.unmount();
    captureMock.getPreferences.mockResolvedValueOnce({ extras: { teleprompterSettings: [] } });
    wrapper = mountApi();
    await flushPromises();
    expect(api.document.value.autoscroll).toBe(true);
  });

  it('accepts continuous and left alignment while rejecting non-finite or mistyped numeric settings', async () => {
    wrapper.unmount();
    captureMock.getPreferences.mockResolvedValueOnce({
      extras: {
        teleprompterSettings: {
          mode: 'continuous',
          autoscroll: true,
          scrollSpeed: Number.POSITIVE_INFINITY,
          fontSize: 'large',
          lineHeight: 'wide',
          textAlign: 'left',
        },
      },
    });
    wrapper = mountApi();
    await flushPromises();
    expect(api.document.value).toMatchObject({
      mode: 'continuous',
      autoscroll: true,
      scrollSpeed: 42,
      fontSize: 36,
      lineHeight: 1.35,
      textAlign: 'left',
    });

    api.nextLine();
    expect(api.activeLine.value).toBe(0);
  });

  it('does not overwrite local changes with a late preference read and tolerates read failure', async () => {
    wrapper.unmount();
    let resolvePreferences!: (value: {
      extras: { teleprompterSettings: { mode: string; autoscroll: boolean } };
    }) => void;
    captureMock.getPreferences.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreferences = resolve;
      }),
    );
    wrapper = mountApi();
    api.updateDocument({ mode: 'line-by-line', autoscroll: false });
    resolvePreferences({ extras: { teleprompterSettings: { mode: 'continuous', autoscroll: true } } });
    await flushPromises();
    expect(api.document.value.mode).toBe('line-by-line');
    expect(api.document.value.autoscroll).toBe(false);

    wrapper.unmount();
    captureMock.getPreferences.mockRejectedValueOnce(new Error('preferences unavailable'));
    wrapper = mountApi();
    await flushPromises();
    expect(api.document.value.mode).toBe('continuous');
    expect(api.error.value).toBe('');
  });

  it('supports missing preference APIs and checkpoints a null session with default scroll', async () => {
    wrapper.unmount();
    const restoreRead = replaceCaptureMethod('getPreferences', undefined);
    const restoreWrite = replaceCaptureMethod('updatePreferences', undefined);
    try {
      wrapper = mountApi();
      await flushPromises();
      const checkpoint = await api.suspendState();
      expect(checkpoint.session).toBeNull();
      expect(checkpoint.scrollTop).toBe(0);
      expect(captureMock.getPreferences).toBeUndefined();
      expect(captureMock.updatePreferences).toBeUndefined();
    } finally {
      restoreRead();
      restoreWrite();
    }
  });

  it('restores a deferred scroll position when the reader attaches and retries empty reader ticks', async () => {
    const deferredState: TeleprompterViewState = {
      document: { ...storedDocument(), mode: 'continuous', autoscroll: true },
      session: null,
      activeLine: 1,
      scrollTop: 88,
      isEditing: false,
      isPaused: false,
      error: '',
    };
    await api.restoreState(deferredState);
    const snapshot = await api.suspendState();
    expect(snapshot.session).toBeNull();
    expect(snapshot.scrollTop).toBe(88);

    const target = display();
    api.setDisplayElement(target);
    expect(target.scrollTo).toHaveBeenCalledWith({ top: 88, behavior: 'instant' });

    frames = [];
    api.setDisplayElement(null);
    api.setVisible(true);
    expect(frames).toHaveLength(1);
    frames.shift()!(100);
    expect(frames).toHaveLength(1);
  });

  it('resumes autoscroll when pause is toggled while autoscroll is disabled', () => {
    api.updateDocument({ autoscroll: false });
    api.togglePause();
    expect(api.document.value.autoscroll).toBe(true);
    expect(api.isPaused.value).toBe(false);
  });

  it('does not fail a checkpoint when global preference writes reject', async () => {
    captureMock.updatePreferences.mockRejectedValueOnce(new Error('preferences write failed'));
    await expect(api.suspendState()).resolves.toMatchObject({ session: null });
  });
});
