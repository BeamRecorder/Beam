import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { capture } from '~/api/capture';
import type { PreferenceSettings } from '~/api/types/capture-api';
import { useTimelineZoom } from '../useTimelineZoom';
import { clampTimelineZoom, MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM } from '../timeline-zoom';

vi.mock('~/api/capture', () => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(() => vi.fn()),
  },
}));

const createMockPreferences = (timelineZoomLevel?: number): PreferenceSettings =>
  ({
    schemaVersion: 3,
    theme: 'system',
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: true, noticeDismissed: true },
    alwaysOnTop: true,
    devices: {},
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: timelineZoomLevel !== undefined ? { timelineZoomLevel } : {},
  }) as PreferenceSettings;

describe('useTimelineZoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(200));
    vi.mocked(capture.updatePreferences).mockResolvedValue(createMockPreferences(200));
  });

  it('clamps zoom strictly between MIN and MAX', () => {
    expect(clampTimelineZoom(50)).toBe(MIN_TIMELINE_ZOOM);
    expect(clampTimelineZoom(5000)).toBe(MAX_TIMELINE_ZOOM);
    expect(clampTimelineZoom(250)).toBe(250);
  });

  it('loads and clamps saved zoom from preferences', async () => {
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(300));
    const { timelineZoomLevel, loadPreferences } = useTimelineZoom();
    await loadPreferences();
    expect(timelineZoomLevel.value).toBe(300);
  });

  it('persists zoom changes to preferences', async () => {
    vi.mocked(capture.getPreferences).mockResolvedValue(createMockPreferences(100));
    const { persistZoom } = useTimelineZoom(100);
    await persistZoom(250);
    await flushPromises();

    expect(capture.updatePreferences).toHaveBeenCalledWith({
      extras: expect.objectContaining({ timelineZoomLevel: 250 }),
    });
  });
});
