import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureCatalog, CaptureSource } from '~/api/types/capture-api';
import { useCaptureSourcePreviews } from './useCaptureSourcePreviews';

const mocks = vi.hoisted(() => ({ discover: vi.fn(), getSources: vi.fn(), getSourcePreview: vi.fn() }));
vi.mock('../../api/capture', () => ({ capture: mocks }));
const source: CaptureSource = {
  id: 'x11:window:123',
  kind: 'window',
  label: 'Editor',
  isDefault: false,
  selectionMode: 'direct',
};
const fixture = (direct: boolean) => {
  const sources = ref<CaptureSource[]>([source]);
  const catalog = ref<CaptureCatalog | null>({
    sources: [source],
    capabilities: {},
    diagnostics: {
      platform: 'linux',
      linux: {
        backend: direct ? 'x11' : 'xdg-portal-pipewire',
        architecture: 'x86_64',
        distribution: null,
        distributionId: null,
        distributionVersion: null,
        distributionLike: [],
        kernel: null,
        desktop: 'Cinnamon',
        sessionType: 'x11',
        displayServer: 'x11',
        portal: {
          available: !direct,
          errorCode: null,
          detail: null,
          version: direct ? null : 5,
          monitor: true,
          window: true,
          metadataCursor: true,
        },
        pipewire: { available: true, errorCode: null, detail: null },
        ffmpeg: {
          available: true,
          errorCode: null,
          detail: null,
          codec: 'h264',
          encoder: 'libopenh264',
          hardware: false,
        },
        recordingAvailable: true,
      },
    },
  });
  const selectedWindowId = ref<string | null>(source.id);
  const options = {
    platform: 'linux',
    sources,
    catalog,
    selectedScreenId: ref<string | null>(null),
    selectedWindowId,
    recorderLauncherContext: () => null,
  };
  return { ...options, api: useCaptureSourcePreviews(options) };
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSources.mockResolvedValue([]);
  mocks.getSourcePreview.mockResolvedValue({
    sourceId: source.id,
    thumbnail: 'data:image/jpeg;base64,abc',
    status: 'ready',
  });
});
describe('Linux source previews', () => {
  it('loads X11 native thumbnails without Chromium enumeration', async () => {
    const state = fixture(true);
    await state.api.loadPreviews('window');
    expect(mocks.getSources).not.toHaveBeenCalled();
    expect(mocks.getSourcePreview).toHaveBeenCalledWith(expect.objectContaining({ sourceId: source.id }));
    expect(state.selectedWindowId.value).toBe(source.id);
    expect(state.api.windowPreviews.value[0]?.id).toBe(source.id);
  });
  it('keeps selected X11 sources when a native thumbnail is unavailable', async () => {
    mocks.getSourcePreview.mockResolvedValue({ sourceId: source.id, thumbnail: null, status: 'unavailable' });
    const state = fixture(true);
    await state.api.loadPreviews('window');
    expect(state.selectedWindowId.value).toBe(source.id);
    expect(state.api.windowPreviews.value).toEqual([]);
  });
  it('keeps Portal sources on the existing preview path', async () => {
    const state = fixture(false);
    await state.api.loadPreviews('window');
    expect(mocks.getSources).toHaveBeenCalledWith(['window']);
    expect(mocks.getSourcePreview).not.toHaveBeenCalled();
  });
});
