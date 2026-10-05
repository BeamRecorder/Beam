import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { capture } from '~/api/capture';
import type { PreferenceSettings } from '~/api/types/capture-api';
import {
  clampTimelineHeight,
  DEFAULT_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  MAX_TIMELINE_HEIGHT,
  useTimelineResize,
} from '../useTimelineResize';

vi.mock('~/api/capture', () => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(() => vi.fn()),
  },
}));

const createMockPreferences = (timelineHeight?: number): PreferenceSettings =>
  ({
    schemaVersion: 3,
    theme: 'system',
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: true, noticeDismissed: true },
    alwaysOnTop: true,
    devices: {},
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: timelineHeight !== undefined ? { timelineHeight } : {},
  }) as PreferenceSettings;

describe('useTimelineResize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(250));
    vi.mocked(capture.updatePreferences).mockResolvedValue(createMockPreferences(250));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clamps height strictly between MIN and MAX', () => {
    expect(clampTimelineHeight(50)).toBe(MIN_TIMELINE_HEIGHT);
    expect(clampTimelineHeight(1000)).toBe(MAX_TIMELINE_HEIGHT);
    expect(clampTimelineHeight(300)).toBe(300);
    expect(clampTimelineHeight(NaN)).toBe(DEFAULT_TIMELINE_HEIGHT);
  });

  it('reserves a usable preview when a saved timeline exceeds the scaled window height', () => {
    expect(clampTimelineHeight(520, 680)).toBe(340);
    expect(clampTimelineHeight(520, 540)).toBe(220);
    expect(clampTimelineHeight(520, 270)).toBe(100);
    expect(clampTimelineHeight(520, 1080)).toBe(520);
    expect(clampTimelineHeight(NaN, 540)).toBe(210);
    expect(clampTimelineHeight(520, NaN)).toBe(520);
  });
  it('keeps the preferred height before a browser viewport is available', () => {
    vi.stubGlobal('window', undefined);
    expect(useTimelineResize(520).timelineHeight.value).toBe(520);
  });

  it('adapts to window resizing and preference changes without overwriting the saved height', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 680 });
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(520));
    let resize!: ReturnType<typeof useTimelineResize>;
    const removed = vi.spyOn(window, 'removeEventListener');
    const wrapper = mount({
      setup() {
        resize = useTimelineResize();
        return () => null;
      },
    });
    await flushPromises();
    expect(resize.timelineHeight.value).toBe(340);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    window.dispatchEvent(new Event('resize'));
    expect(resize.timelineHeight.value).toBe(520);
    vi.mocked(capture.onPreferencesChanged).mock.calls[0]![0](createMockPreferences(380));
    expect(resize.timelineHeight.value).toBe(380);
    vi.mocked(capture.onPreferencesChanged).mock.calls[0]![0](createMockPreferences(-1));
    expect(resize.timelineHeight.value).toBe(380);
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    wrapper.unmount();
    expect(removed).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('loads and clamps saved height from preferences', async () => {
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(320));
    const { timelineHeight, loadPreferences } = useTimelineResize();
    await loadPreferences();
    expect(timelineHeight.value).toBe(320);
  });

  it('retains a usable height when preferences are missing, invalid or temporarily unavailable', async () => {
    const resize = useTimelineResize(220);
    for (const preferences of [createMockPreferences(), createMockPreferences(-5)]) {
      vi.mocked(capture.getPreferences).mockResolvedValueOnce(preferences);
      await resize.loadPreferences();
      expect(resize.timelineHeight.value).toBe(220);
    }
    vi.mocked(capture.getPreferences).mockRejectedValueOnce(new Error('Read unavailable'));
    await expect(resize.loadPreferences()).resolves.toBeUndefined();
    vi.mocked(capture.updatePreferences).mockRejectedValueOnce(new Error('Write unavailable'));
    await expect(resize.persistHeight(220)).resolves.toBeUndefined();
  });

  it('still initializes the responsive layout when the preference subscription cannot be installed', async () => {
    vi.mocked(capture.onPreferencesChanged).mockImplementationOnce(() => {
      throw new Error('Subscription unavailable');
    });
    const wrapper = mount({
      setup() {
        useTimelineResize();
        return () => null;
      },
    });
    await flushPromises();
    wrapper.unmount();
  });

  it('resizes within bounds when dragging and persists to preferences', async () => {
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(210));
    const { timelineHeight, isResizingTimeline, startTimelineResize } = useTimelineResize(210);

    const pointerDownEvent = {
      preventDefault: () => {},
      clientY: 500,
    } as unknown as PointerEvent;
    startTimelineResize(pointerDownEvent);
    expect(isResizingTimeline.value).toBe(true);

    // Dragging up by 50px (500 -> 450) increases timeline height from 210 to 260
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 450 }));

    // Releasing finishes resize, flushes pending RAF and persists
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(timelineHeight.value).toBe(260);
    expect(isResizingTimeline.value).toBe(false);
    await flushPromises();

    expect(capture.updatePreferences).toHaveBeenCalledWith({
      extras: expect.objectContaining({ timelineHeight: 260 }),
    });
  });

  it('starts dragging from the actual fitted height instead of the oversized saved height', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 680 });
    const resize = useTimelineResize(520);
    resize.startTimelineResize({ preventDefault() {}, clientY: 500 } as PointerEvent);
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 540 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(resize.timelineHeight.value).toBe(300);
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalledWith({ extras: { timelineHeight: 300 } });
  });

  it('coalesces drag updates per frame and commits the final position', async () => {
    let frame!: FrameRequestCallback;
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 42;
    });
    const resize = useTimelineResize(210);
    resize.startTimelineResize({ preventDefault() {}, clientY: 500 } as PointerEvent);
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 470 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 450 }));
    expect(request).toHaveBeenCalledOnce();
    frame(0);
    expect(resize.timelineHeight.value).toBe(260);
    window.dispatchEvent(new MouseEvent('pointerup'));
    await flushPromises();
  });

  it('supports mouse resizing without animation frames and a click without a move', async () => {
    const original = window.requestAnimationFrame;
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: undefined });
    try {
      const resize = useTimelineResize(210);
      resize.startTimelineResize({ preventDefault() {}, clientY: 500 } as PointerEvent);
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 450 }));
      expect(resize.timelineHeight.value).toBe(260);
      window.dispatchEvent(new MouseEvent('mouseup'));
      resize.startTimelineResize({ preventDefault() {}, clientY: 500 } as PointerEvent);
      window.dispatchEvent(new MouseEvent('pointerup'));
      expect(resize.timelineHeight.value).toBe(260);
      await flushPromises();
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: original });
    }
  });
  it('cancels pending drag work on teardown without persisting an unfinished resize', async () => {
    let resize!: ReturnType<typeof useTimelineResize>;
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const wrapper = mount({
      setup() {
        resize = useTimelineResize();
        return () => null;
      },
    });
    await flushPromises();
    resize.startTimelineResize({ preventDefault() {}, clientY: 500 } as PointerEvent);
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 450 }));
    wrapper.unmount();
    expect(cancel).toHaveBeenCalledWith(42);
    expect(resize.isResizingTimeline.value).toBe(false);
    window.dispatchEvent(new MouseEvent('pointerup'));
    await flushPromises();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
  });
});
