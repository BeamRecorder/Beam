import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipComposition } from '../useClipComposition';
import type { CaptureProject, ProjectEditorData } from '../../../api/types/capture-api';
import type { MediaAsset } from '../../composition/composition-types';

const { capture, getAudioTracks } = vi.hoisted(() => ({
  capture: { pickProjectMedia: vi.fn() },
  getAudioTracks: vi.fn(),
}));

vi.mock('../../../../api/capture', () => ({ capture }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class BlobSource { constructor(public readonly blob: Blob) {} },
  Input: class Input {
    async getAudioTracks() { return getAudioTracks(); }
    dispose() {}
  },
}));

const project: CaptureProject = {
  id: 'project-1', name: 'Project', createdAt: '2026-01-01', updatedAt: '2026-01-01', sessionCount: 1, previewSrc: null,
};

const imageAsset = (): MediaAsset => ({
  id: 'image-asset', kind: 'image', name: 'Poster', fileName: 'poster.png', durationMs: 0,
  width: 800, height: 600, src: 'poster.png', origin: 'project',
});

const audioAsset = (): MediaAsset => ({
  id: 'audio-asset', kind: 'audio', name: 'Music', fileName: 'music.wav', durationMs: 0,
  width: null, height: null, src: 'music.wav', origin: 'project',
});

const videoAsset = (): MediaAsset => ({
  id: 'video-asset', kind: 'video', name: 'Video', fileName: 'video.mp4', durationMs: 0,
  width: 1920, height: 1080, src: 'video.mp4', origin: 'project',
});

const editorData = (): ProjectEditorData => ({
  sessionId: 'session-1', videoSrc: 'session.mp4',
  manifest: {
    schemaVersion: 1, projectId: 'project-1', sessionId: 'session-1', createdAtUtc: '', sessionStartMonotonicNs: 0,
    durationNs: 4_000_000_000, platform: {}, selectedSources: {}, tracks: [], permissions: {}, warnings: [], completed: true,
  },
  tracks: [
    { trackId: 'screen', kind: 'screen', sourceId: null, format: {}, segments: [], assets: [{ path: 'screen.mp4', startNs: 0, endNs: 4_000_000_000, complete: true, src: 'session.mp4', exists: true }], metrics: {}, status: 'completed', terminationReason: null },
    { trackId: 'failed', kind: 'camera', sourceId: null, format: {}, segments: [], assets: [], metrics: {}, status: 'failed', terminationReason: 'error' },
    { trackId: 'ignored', kind: 'cursor', sourceId: null, format: {}, segments: [], assets: [], metrics: {}, status: 'completed', terminationReason: null },
  ],
  cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
  zoom: { elements: [], generatedSessions: [] },
});

let wrapper: VueWrapper | undefined;

const mountComposable = () => {
  const projectRef = ref<CaptureProject | null>(project);
  const editorRef = ref<ProjectEditorData | null>(null);
  const currentTimeSec = ref(1.5);
  const activeTab = ref('canvas');
  let state!: ReturnType<typeof useClipComposition>;
  const Harness = defineComponent({
    setup() { state = useClipComposition({ project: projectRef, editorData: editorRef, currentTimeSec, activeTab }); return () => h('div'); },
  });
  wrapper = mount(Harness);
  return { projectRef, editorRef, currentTimeSec, activeTab, get state() { return state; } };
};

const mockMediaMetadata = (duration = 2.5) => {
  const original = document.createElement.bind(document);
  const create = vi.spyOn(document, 'createElement');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  create.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    const element = original(tagName, options);
    if (tagName === 'video' || tagName === 'audio') {
      queueMicrotask(() => {
        Object.defineProperty(element, 'duration', { configurable: true, value: duration });
        element.dispatchEvent(new Event('loadedmetadata'));
      });
    }
    return element;
  }) as typeof document.createElement);
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  capture.pickProjectMedia.mockResolvedValue(null);
  getAudioTracks.mockResolvedValue([]);
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => `uuid-${Math.random().toString(36).slice(2, 8)}`);
});

describe('useClipComposition', () => {
  it('adds captions, selects valid clips, exposes typed selection info, and synchronizes recording tracks', async () => {
    const mounted = mountComposable();
    expect(mounted.state.selectedClipInfo.value).toBeNull();
    await mounted.state.addCaptionAtTime(700);
    expect(mounted.state.composition.value.clips).toHaveLength(1);
    expect(mounted.state.selectedCaptionClip.value?.kind).toBe('caption');
    expect(mounted.activeTab.value).toBe('clip');
    expect(mounted.state.selectedClipInfo.value).toMatchObject({ kind: 'caption', timelineStartMs: 700, isLinked: false });

    const caption = mounted.state.selectedCaptionClip.value!;
    mounted.state.updateCaption({ ...caption, name: 'Edited caption' });
    expect(mounted.state.selectedClip.value?.name).toBe('Edited caption');
    mounted.state.selectClip('missing');
    expect(mounted.state.selectedClipId.value).toBe(caption.id);

    mounted.editorRef.value = editorData();
    mounted.state.synchronizeRecording();
    expect(mounted.state.composition.value.clips.some((clip) => clip.kind === 'screen')).toBe(true);
    const count = mounted.state.composition.value.clips.length;
    mounted.state.synchronizeRecording();
    expect(mounted.state.composition.value.clips).toHaveLength(count);
  });

  it('adds images and audio, handles missing projects/assets, and applies media duration rules', async () => {
    const mounted = mountComposable();
    mounted.projectRef.value = null;
    await mounted.state.addElement('image');
    expect(mounted.state.composition.value.clips).toHaveLength(0);
    mounted.projectRef.value = project;

    capture.pickProjectMedia.mockResolvedValueOnce(null);
    await mounted.state.addElement('sound');
    expect(mounted.state.composition.value.clips).toHaveLength(0);

    capture.pickProjectMedia.mockResolvedValueOnce(imageAsset());
    await mounted.state.addElement('image', -10);
    expect(mounted.state.selectedClip.value).toMatchObject({ kind: 'image', timelineStartMs: 0, timelineDurationMs: 5_000 });
    expect(mounted.state.selectedClipInfo.value).toMatchObject({ isMirrored: false, borderEnabled: false, frame: 'none' });

    mockMediaMetadata();
    capture.pickProjectMedia.mockResolvedValueOnce(audioAsset());
    await mounted.state.addElement('sound', 6_000);
    expect(mounted.state.composition.value.clips.some((clip) => clip.kind === 'audio')).toBe(true);
    expect(mounted.state.composition.value.clips.find((clip) => clip.kind === 'audio')?.timelineDurationMs).toBe(2_500);
  });

  it('adds a video with or without a linked imported audio clip', async () => {
    const mounted = mountComposable();
    mockMediaMetadata();
    getAudioTracks.mockResolvedValueOnce([{ id: 'audio-track' }]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Blob(['video']), { status: 200 }));
    capture.pickProjectMedia.mockResolvedValueOnce(videoAsset());
    await mounted.state.addElement('video');
    expect(mounted.state.composition.value.clips.filter((clip) => clip.groupId)).toHaveLength(2);
    expect(mounted.state.selectedWebcamClip.value).toBeNull();

    getAudioTracks.mockRejectedValueOnce(new Error('cannot inspect'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Blob(['video']), { status: 200 }));
    capture.pickProjectMedia.mockResolvedValueOnce({ ...videoAsset(), id: 'video-2', name: 'Silent video' });
    await mounted.state.addElement('video', 4_000);
    expect(mounted.state.composition.value.clips.filter((clip) => clip.kind === 'video')).toHaveLength(2);

  });

  it('rejects a video whose native metadata has no readable duration', async () => {
    const mounted = mountComposable();
    mockMediaMetadata(0);
    capture.pickProjectMedia.mockResolvedValueOnce({ ...videoAsset(), id: 'broken', name: 'Broken' });
    await expect(mounted.state.addElement('video')).rejects.toThrow('Impossible de lire');
  });

  it('previews edits, splits/reorders/deletes clips, and guards invalid selections', async () => {
    const mounted = mountComposable();
    capture.pickProjectMedia.mockResolvedValueOnce(imageAsset());
    await mounted.state.addElement('image', 0);
    const imageId = mounted.state.selectedClipId.value!;
    mounted.state.previewClipEdge('missing', 'start', 100);
    mounted.state.previewClipEdge(imageId, 'start', 20);
    mounted.state.trimClipEdge(imageId, 'end', 2_000);
    mounted.state.previewMoveClip(imageId, -500);
    expect(mounted.state.selectedClip.value?.timelineStartMs).toBe(0);
    mounted.state.updateSelectedAppearance({ borderEnabled: true, frame: 'safari' });
    mounted.state.updateSelectedTransform({ x: 0.1, y: 0.2, width: 0.7, height: 0.6 });
    mounted.state.updateSelectedCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    mounted.state.updateSelectedMirrored(true);
    mounted.state.updateSelectedRate(2);
    expect(() => mounted.state.updateSelectedVolume(150)).toThrow('Only audio');
    mounted.state.updateSelectedEnabled(false);
    expect(mounted.state.selectedClipInfo.value).toMatchObject({ borderEnabled: true, frame: 'safari', isMirrored: true, playbackRate: 2, enabled: false });

    mockMediaMetadata();
    capture.pickProjectMedia.mockResolvedValueOnce(audioAsset());
    await mounted.state.addElement('sound', 6_000);
    mounted.state.updateSelectedVolume(150);
    expect(mounted.state.selectedClipInfo.value).toMatchObject({ volume: 150 });
    mounted.state.selectClip(imageId);

    mounted.state.toggleClip(imageId);
    mounted.state.detachSelectedClip();
    mounted.currentTimeSec.value = 1;
    mounted.state.splitSelectedClip();
    expect(mounted.state.composition.value.clips.length).toBeGreaterThanOrEqual(1);
    mounted.state.reorderVisualClip(imageId, 0);
    mounted.state.deleteSelectedClip();
    expect(mounted.state.selectedClipId.value).toBeNull();
    mounted.state.updateSelectedTransform({ x: 0, y: 0, width: 1, height: 1 });
    mounted.state.updateSelectedCrop({ x: 0, y: 0, width: 1, height: 1 });
    mounted.state.updateSelectedMirrored(false);
    mounted.state.updateSelectedRate(1);
    expect(() => mounted.state.updateSelectedVolume(100)).not.toThrow();
    mounted.state.updateSelectedEnabled(true);
    await nextTick();
  });
});
