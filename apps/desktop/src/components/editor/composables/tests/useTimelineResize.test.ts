import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
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
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(250));
    vi.mocked(capture.updatePreferences).mockResolvedValue(createMockPreferences(250));
  });

  it('clamps height strictly between MIN and MAX', () => {
    expect(clampTimelineHeight(50)).toBe(MIN_TIMELINE_HEIGHT);
    expect(clampTimelineHeight(1000)).toBe(MAX_TIMELINE_HEIGHT);
    expect(clampTimelineHeight(300)).toBe(300);
    expect(clampTimelineHeight(NaN)).toBe(DEFAULT_TIMELINE_HEIGHT);
  });

  it('loads and clamps saved height from preferences', async () => {
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(320));
    const { timelineHeight, loadPreferences } = useTimelineResize();
    await loadPreferences();
    expect(timelineHeight.value).toBe(320);
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
});
