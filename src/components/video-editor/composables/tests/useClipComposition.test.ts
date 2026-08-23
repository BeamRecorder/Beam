import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipComposition } from '../useClipComposition';
import type { CaptureProject, ProjectEditorData } from '../../../../api/types/capture-api';
import type {
  AudioClip,
  BlurClip,
  CaptionClip,
  ClipComposition,
  MediaAsset,
  VisualClip,
} from '~/media/shared/composition-types';
import type { DroppedMediaInspection } from '~/media/shared/media-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';

const { capture, getAudioTracks } = vi.hoisted(() => ({
  capture: { pickProjectMedia: vi.fn() },
  getAudioTracks: vi.fn(),
}));
let mockInspectionDuration = 2.5;

vi.mock('../../../../api/capture', () => ({ capture }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  MP4: {},
  QTFF: {},
  WEBM: {},
  MATROSKA: {},
  MP3: {},
  WAVE: {},
  OGG: {},
  ADTS: {},
  UnsupportedInputFormatError: class UnsupportedInputFormatError extends Error {},
  InputDisposedError: class InputDisposedError extends Error {},
  UrlSource: class UrlSource {
    readonly url: string;
    constructor(url: string) {
      this.url = url;
    }
    ref() {
      return { url: this.url, free: vi.fn() };
    }
  },
  BlobSource: class BlobSource {
    readonly blob: Blob;
    constructor(blob: Blob) {
      this.blob = blob;
    }
  },
  Input: class Input {
    readonly options: { source?: { url?: string } };
    constructor(options: { source?: { url?: string } }) {
      this.options = options;
    }
    private get isAudioSource() {
      return /\.(?:mp3|wav|ogg|opus|m4a)(?:$|\?)/i.test(this.options.source?.url ?? '');
    }
    async getFormat() {
      return { name: this.isAudioSource ? 'wav' : 'mp4' };
    }
    async getMimeType() {
      return this.isAudioSource ? 'audio/wav' : 'video/mp4';
    }
    async getDurationFromMetadata() {
      return mockInspectionDuration;
    }
    async getVideoTracks() {
      if (this.isAudioSource) return [];
      return [
        {
          id: 'video-track',
          getCodec: async () => 'avc1',
          getCodecParameterString: async () => null,
          getCodedWidth: async () => 1920,
          getCodedHeight: async () => 1080,
          getDisplayWidth: async () => 1920,
          getDisplayHeight: async () => 1080,
          getRotation: async () => 0,
          getPixelAspectRatio: async () => ({ num: 1, den: 1 }),
          getDecoderConfig: async () => null,
          canDecode: async () => true,
        },
      ];
    }
    async getAudioTracks() {
      const tracks = await getAudioTracks();
      const sourceTracks = tracks.length > 0 || !this.isAudioSource ? tracks : [{ id: 'audio-track' }];
      return sourceTracks.map((track: { id?: string }) => ({
        id: track.id ?? 'audio-track',
        getCodec: async () => 'opus',
        getCodecParameterString: async () => null,
        getNumberOfChannels: async () => 2,
        getSampleRate: async () => 48_000,
        getDecoderConfig: async () => null,
        canDecode: async () => true,
      }));
    }
    async computeDuration() {
      return mockInspectionDuration;
    }
    dispose() {}
  },
}));

const project: CaptureProject = {
  id: 'project-1',
  name: 'Project',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  sessionCount: 1,
  previewSrc: null,
};

const imageAsset = (): MediaAsset => ({
  id: 'image-asset',
  kind: 'image',
  name: 'Poster',
  fileName: 'poster.png',
  durationMs: 0,
  width: 800,
  height: 600,
  src: 'poster.png',
  origin: 'project',
});

const audioAsset = (): MediaAsset => ({
  id: 'audio-asset',
  kind: 'audio',
  name: 'Music',
  fileName: 'music.wav',
  durationMs: 0,
  width: null,
  height: null,
  src: 'music.wav',
  origin: 'project',
});

const videoAsset = (): MediaAsset => ({
  id: 'video-asset',
  kind: 'video',
  name: 'Video',
  fileName: 'video.mp4',
  durationMs: 0,
  width: 1920,
  height: 1080,
  src: 'video.mp4',
  origin: 'project',
});

const videoInspection = (canDecodeAudio: boolean): DroppedMediaInspection => ({
  kind: 'video',
  durationMs: 2_500,
  width: 1_920,
  height: 1_080,
  hasAudio: true,
  canDecodeAudio,
  audioCodec: 'opus',
});

const visualClip = (id: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  trackId: id,
  kind: 'image',
  name: id,
  assetId: `${id}-asset`,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const audioClip = (id: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: `${id}-asset`,
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  volume: 100,
  ...overrides,
});

const blurClip = (id: string, overrides: Partial<BlurClip> = {}): BlurClip => ({
  id,
  trackId: id,
  kind: 'blur',
  name: id,
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: -1,
  transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 40,
  feather: 0,
  cornerRadius: 0,
  tintOpacity: 0,
  color: '#000000',
  ...overrides,
});

const textCaptionClip = (id: string, text: string, color: string, customText: string): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  caption: {
    type: 'text',
    sentences: [{ id: `${id}-sentence`, text, startMs: 0, endMs: 2_000, words: [] }],
    style: { ...createDefaultCaptionStyle(), color, customText },
  },
});

const mediaAssetFor = (id: string, kind: MediaAsset['kind']): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : kind === 'video' ? 'mp4' : 'png'}`,
  durationMs: 2_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `${id}.asset`,
  origin: 'project',
});

const editorData = (): ProjectEditorData => ({
  sessionId: 'session-1',
  videoSrc: 'session.mp4',
  manifest: {
    schemaVersion: 1,
    projectId: 'project-1',
    sessionId: 'session-1',
    createdAtUtc: '',
    sessionStartMonotonicNs: 0,
    durationNs: 4_000_000_000,
    platform: {},
    selectedSources: {},
    tracks: [],
    permissions: {},
    warnings: [],
    completed: true,
  },
  tracks: [
    {
      trackId: 'screen',
      kind: 'screen',
      sourceId: null,
      format: {},
      segments: [],
      assets: [
        { path: 'screen.mp4', startNs: 0, endNs: 4_000_000_000, complete: true, src: 'session.mp4', exists: true },
      ],
      metrics: {},
      status: 'completed',
      terminationReason: null,
    },
    {
      trackId: 'failed',
      kind: 'camera',
      sourceId: null,
      format: {},
      segments: [],
      assets: [],
      metrics: {},
      status: 'failed',
      terminationReason: 'error',
    },
    {
      trackId: 'ignored',
      kind: 'cursor',
      sourceId: null,
      format: {},
      segments: [],
      assets: [],
      metrics: {},
      status: 'completed',
      terminationReason: null,
    },
  ],
  cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
  recordedPlatform: null,
  zoom: { elements: [], generatedSessions: [] },
});

let wrapper: VueWrapper | undefined;

const mountComposable = (defaults = normalizeEditorPreferenceDefaults(undefined)) => {
  const projectRef = ref<CaptureProject | null>(project);
  const editorRef = ref<ProjectEditorData | null>(null);
  const currentTimeSec = ref(1.5);
  const activeTab = ref('canvas');
  const editorDefaults = ref(defaults);
  let state!: ReturnType<typeof useClipComposition>;
  const Harness = defineComponent({
    setup() {
      state = useClipComposition({
        project: projectRef,
        editorData: editorRef,
        currentTimeSec,
        activeTab,
        editorDefaults,
      });
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
  return {
    projectRef,
    editorRef,
    currentTimeSec,
    activeTab,
    editorDefaults,
    get state() {
      return state;
    },
  };
};

const mockMediaMetadata = (duration = 2.5) => {
  mockInspectionDuration = duration;
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
  mockInspectionDuration = 2.5;
  capture.pickProjectMedia.mockResolvedValue(null);
  getAudioTracks.mockResolvedValue([]);
  let uuidCounter = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    uuidCounter += 1;
    return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}` as ReturnType<typeof crypto.randomUUID>;
  });
});

describe('useClipComposition', () => {
  it('adds captions, selects valid clips, exposes typed selection info, and synchronizes recording tracks', async () => {
    const mounted = mountComposable();
    expect(mounted.state.selectedClipInfo.value).toBeNull();
    await mounted.state.addCaptionAtTime(700);
    expect(mounted.state.composition.value.clips).toHaveLength(1);
    expect(mounted.state.selectedCaptionClip.value?.kind).toBe('caption');
    expect(mounted.activeTab.value).toBe('clip');
    expect(mounted.state.selectedClipInfo.value).toMatchObject({
      kind: 'caption',
      timelineStartMs: 700,
      isLinked: false,
    });

    const caption = mounted.state.selectedCaptionClip.value!;
    expect(caption.caption).toMatchObject({
      type: 'text',
      sentences: [],
      style: { customText: 'Hello' },
    });
    mounted.state.updateCaption({ ...caption, name: 'Edited caption' });
    expect(mounted.state.selectedClip.value?.name).toBe('Edited caption');
    mounted.state.selectClip('missing');
    expect(mounted.state.selectedClipId.value).toBe(caption.id);
    expect(mounted.state.selectedClipIds.value).toEqual([caption.id]);

    mounted.editorRef.value = editorData();
    mounted.state.synchronizeRecording();
    expect(mounted.state.composition.value.clips.some((clip) => clip.kind === 'screen')).toBe(true);
    const count = mounted.state.composition.value.clips.length;
    mounted.state.synchronizeRecording();
    expect(mounted.state.composition.value.clips).toHaveLength(count);
  });

  it('adds a new text layer above existing captions and selects it', async () => {
    const mounted = mountComposable();
    const existingCaption = textCaptionClip('existing-caption', 'Existing', '#ffffff', 'Existing');
    const existingVisual = visualClip('existing-visual', { order: 1 });
    mounted.state.composition.value = {
      ...mounted.state.composition.value,
      assets: [mediaAssetFor(existingVisual.assetId, 'image')],
      clips: [existingCaption, existingVisual],
    };

    await mounted.state.addElement('caption', 400);

    const addedCaption = mounted.state.selectedCaptionClip.value;
    expect(addedCaption).toMatchObject({
      kind: 'caption',
      timelineStartMs: 400,
      caption: { type: 'text', style: { customText: 'Hello' } },
    });
    expect(mounted.state.selectedClipId.value).toBe(addedCaption?.id);
    expect(mounted.activeTab.value).toBe('clip');

    const textLayers = mounted.state.composition.value.clips
      .filter((clip) => clip.kind === 'caption' && clip.caption.type === 'text')
      .sort((left, right) => left.order - right.order);
    expect(textLayers.map((clip) => clip.id)).toEqual([addedCaption?.id, existingCaption.id]);
    const persistedExistingCaption = mounted.state.composition.value.clips.find(
      (clip) => clip.id === existingCaption.id,
    );
    expect(addedCaption?.order).toBeLessThan(persistedExistingCaption?.order ?? Number.POSITIVE_INFINITY);
    expect(mounted.state.composition.value.clips.find((clip) => clip.id === existingVisual.id)?.order).toBeGreaterThan(
      persistedExistingCaption?.order ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('reorders text captions within their layer stack, clamps indices, and ignores non-text clips', () => {
    const mounted = mountComposable();
    const first = textCaptionClip('caption-first', 'First', '#ffffff', 'First');
    const middle = textCaptionClip('caption-middle', 'Middle', '#ffffff', 'Middle');
    const last = textCaptionClip('caption-last', 'Last', '#ffffff', 'Last');
    const visual = visualClip('visual', { order: 3 });
    const audio = audioClip('audio', { order: 4 });
    mounted.state.composition.value = {
      ...mounted.state.composition.value,
      assets: [mediaAssetFor(visual.assetId, 'image'), mediaAssetFor(audio.assetId, 'audio')],
      clips: [first, middle, last, visual, audio],
    };
    mounted.state.selectClip(middle.id);

    mounted.state.reorderCaptionClip(middle.id, 100);
    let textLayers = mounted.state.composition.value.clips
      .filter((clip) => clip.kind === 'caption' && clip.caption.type === 'text')
      .sort((left, right) => left.order - right.order);
    expect(textLayers.map((clip) => clip.id)).toEqual([first.id, last.id, middle.id]);
    expect(mounted.state.selectedClipId.value).toBe(middle.id);

    mounted.state.reorderCaptionClip(middle.id, -100);
    textLayers = mounted.state.composition.value.clips
      .filter((clip) => clip.kind === 'caption' && clip.caption.type === 'text')
      .sort((left, right) => left.order - right.order);
    expect(textLayers.map((clip) => clip.id)).toEqual([middle.id, first.id, last.id]);
    expect(
      mounted.state.composition.value.clips
        .filter((clip) => clip.id === visual.id || clip.id === audio.id)
        .sort((left, right) => left.order - right.order)
        .map((clip) => clip.id),
    ).toEqual([visual.id, audio.id]);

    mounted.state.reorderCaptionClip(visual.id, 0);
    mounted.state.reorderCaptionClip('missing', 0);
    expect(mounted.state.composition.value.clips.find((clip) => clip.id === visual.id)?.order).toBeGreaterThan(
      last.order,
    );
    expect(mounted.state.selectedClipId.value).toBe(middle.id);
  });

  it('deduplicates valid multi-selection IDs and returns to one clip with selectClip', () => {
    const mounted = mountComposable();
    const first = visualClip('first');
    const second = visualClip('second');
    mounted.state.composition.value = { ...mounted.state.composition.value, clips: [first, second] };

    mounted.state.selectClips(['first', 'missing', 'first', 'second'], 'second');

    expect(mounted.state.selectedClipIds.value).toEqual(['first', 'second']);
    expect(mounted.state.selectedClipId.value).toBe('second');
    mounted.state.selectClip('first');
    expect(mounted.state.selectedClipIds.value).toEqual(['first']);
    expect(mounted.state.selectedClipId.value).toBe('first');
  });

  it('applies enabled, appearance, volume, and blur updates to every selected compatible clip', () => {
    const mounted = mountComposable();
    const firstVisual = visualClip('visual-first');
    const secondVisual = visualClip('visual-second', { enabled: false });
    const firstAudio = audioClip('audio-first');
    const secondAudio = audioClip('audio-second', { volume: 35 });
    const firstBlur = blurClip('blur-first');
    const secondBlur = blurClip('blur-second', { mode: 'frosted', strength: 20 });
    mounted.state.composition.value = {
      ...mounted.state.composition.value,
      assets: [
        mediaAssetFor('visual-first-asset', 'image'),
        mediaAssetFor('visual-second-asset', 'image'),
        mediaAssetFor('audio-first-asset', 'audio'),
        mediaAssetFor('audio-second-asset', 'audio'),
      ],
      clips: [firstVisual, secondVisual, firstAudio, secondAudio, firstBlur, secondBlur],
    };

    mounted.state.selectClips(['visual-first', 'visual-second']);
    mounted.state.updateSelectedEnabled(false);
    mounted.state.updateSelectedAppearance({ borderEnabled: true, frame: 'safari' });
    expect(mounted.state.composition.value.clips.filter((clip) => clip.kind === 'image')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'visual-first',
          enabled: false,
          appearance: expect.objectContaining({ borderEnabled: true, frame: 'safari' }),
        }),
        expect.objectContaining({
          id: 'visual-second',
          enabled: false,
          appearance: expect.objectContaining({ borderEnabled: true, frame: 'safari' }),
        }),
      ]),
    );

    mounted.state.selectClips(['audio-first', 'audio-second']);
    mounted.state.updateSelectedVolume(65);
    expect(mounted.state.composition.value.clips.filter((clip) => clip.kind === 'audio')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'audio-first', volume: 65 }),
        expect.objectContaining({ id: 'audio-second', volume: 65 }),
      ]),
    );

    mounted.state.selectClips(['blur-first', 'blur-second']);
    mounted.state.updateSelectedBlur({ mode: 'pixelated', strength: 90, feather: 12 });
    expect(mounted.state.composition.value.clips.filter((clip) => clip.kind === 'blur')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'blur-first', mode: 'pixelated', strength: 90, feather: 12 }),
        expect.objectContaining({ id: 'blur-second', mode: 'pixelated', strength: 90, feather: 12 }),
      ]),
    );
  });

  it('deletes all selected clips, including linked group members', () => {
    const mounted = mountComposable();
    const groupedVisual = visualClip('grouped-visual', { kind: 'video', groupId: 'group-1' });
    const groupedAudio = audioClip('grouped-audio', { groupId: 'group-1' });
    const independent = visualClip('independent');
    mounted.state.composition.value = {
      ...mounted.state.composition.value,
      assets: [
        mediaAssetFor('grouped-visual-asset', 'video'),
        mediaAssetFor('grouped-audio-asset', 'audio'),
        mediaAssetFor('independent-asset', 'image'),
      ],
      clips: [groupedVisual, groupedAudio, independent],
    };

    mounted.state.selectClips(['grouped-visual', 'independent']);
    mounted.state.deleteSelectedClip();

    expect(mounted.state.composition.value.clips).toEqual([]);
    expect(mounted.state.selectedClipId.value).toBeNull();
    expect(mounted.state.selectedClipIds.value).toEqual([]);
  });

  it('batches caption style changes without copying text content or customText', () => {
    const mounted = mountComposable();
    const first = textCaptionClip('caption-first', 'First sentence', '#ffffff', 'First custom text');
    const second = textCaptionClip('caption-second', 'Second sentence', '#00ff00', 'Second custom text');
    mounted.state.composition.value = { ...mounted.state.composition.value, clips: [first, second] };
    mounted.state.selectClips(['caption-first', 'caption-second'], 'caption-first');

    const updatedPrimary = mounted.state.selectedCaptionClip.value!;
    if (updatedPrimary.caption.type !== 'text') throw new Error('Expected a text caption');
    mounted.state.updateCaption({
      ...updatedPrimary,
      caption: {
        ...updatedPrimary.caption,
        sentences: [{ id: 'changed', text: 'Changed primary sentence', startMs: 0, endMs: 2_000, words: [] }],
        style: { ...updatedPrimary.caption.style, color: '#ff00aa', customText: 'Changed primary custom text' },
      },
    });

    const updatedFirst = mounted.state.composition.value.clips.find((clip) => clip.id === 'caption-first')!;
    const updatedSecond = mounted.state.composition.value.clips.find((clip) => clip.id === 'caption-second')!;
    expect(updatedFirst).toMatchObject({
      caption: {
        sentences: [expect.objectContaining({ text: 'Changed primary sentence' })],
        style: { color: '#ff00aa', customText: 'Changed primary custom text' },
      },
    });
    expect(updatedSecond).toMatchObject({
      caption: {
        sentences: [expect.objectContaining({ text: 'Second sentence' })],
        style: { color: '#ff00aa', customText: 'Second custom text' },
      },
    });
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
    expect(mounted.state.selectedClip.value).toMatchObject({
      kind: 'image',
      timelineStartMs: 0,
      timelineDurationMs: 5_000,
    });
    expect(mounted.state.selectedClipInfo.value).toMatchObject({
      isMirrored: false,
      borderEnabled: false,
      frame: 'none',
    });

    mockMediaMetadata();
    capture.pickProjectMedia.mockResolvedValueOnce(audioAsset());
    await mounted.state.addElement('sound', 6_000);
    expect(mounted.state.composition.value.clips.some((clip) => clip.kind === 'audio')).toBe(true);
    expect(mounted.state.composition.value.clips.find((clip) => clip.kind === 'audio')?.timelineDurationMs).toBe(2_500);
  });

  it('uses visual defaults for a new image while preserving an existing clip presentation', () => {
    const defaults = normalizeEditorPreferenceDefaults({
      visual: {
        image: {
          transform: { x: 0.2, y: 0.15, width: 0.5, height: 0.45 },
          appearance: { ...createDefaultClipAppearance('image'), cornerRadius: 'lg', frame: 'safari' },
          isMirrored: true,
          isMirroredY: false,
          playbackRate: 1.5,
          transitions: { entry: null, exit: null },
          cameraLayoutPreset: 'floating-center',
          cameraFramingPreset: 'circle',
        },
      },
    });
    const mounted = mountComposable(defaults);
    const existingVisual: VisualClip = {
      id: 'existing-image',
      trackId: 'existing-image',
      kind: 'image',
      name: 'Existing image',
      assetId: 'existing-image-asset',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 0,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      enabled: true,
      order: 0,
      transform: { x: -0.1, y: 0.05, width: 0.8, height: 0.7 },
      appearance: createDefaultClipAppearance('image'),
      isMirrored: false,
      isMirroredY: true,
    };
    mounted.state.composition.value = {
      ...mounted.state.composition.value,
      assets: [{ ...imageAsset(), id: 'existing-image-asset' }],
      clips: [existingVisual],
    };

    mounted.state.addImportedAsset(
      imageAsset(),
      {
        kind: 'image',
        durationMs: 5_000,
        width: 800,
        height: 600,
        hasAudio: false,
        canDecodeAudio: false,
        audioCodec: null,
      },
      2_000,
    );

    const existingAfter = mounted.state.composition.value.clips.find((clip) => clip.id === existingVisual.id);
    const inserted = mounted.state.composition.value.clips.find(
      (clip) => 'assetId' in clip && clip.assetId === 'image-asset',
    );
    expect(existingAfter).toMatchObject({
      transform: existingVisual.transform,
      appearance: existingVisual.appearance,
      playbackRate: existingVisual.playbackRate,
      isMirrored: existingVisual.isMirrored,
      isMirroredY: existingVisual.isMirroredY,
    });
    expect(inserted).toMatchObject({
      kind: 'image',
      timelineStartMs: 2_000,
      timelineDurationMs: 5_000 / 1.5,
      playbackRate: 1.5,
      transform: defaults.visual?.image?.transform,
      appearance: expect.objectContaining({ cornerRadius: 'lg', frame: 'safari' }),
      isMirrored: true,
      cameraLayoutPreset: 'floating-center',
      cameraFramingPreset: 'circle',
    });
  });

  it('adds and updates an assetless blur overlay at the playhead', async () => {
    const mounted = mountComposable();
    mounted.currentTimeSec.value = 2;

    await mounted.state.addElement('blur');
    expect(mounted.state.selectedClip.value).toMatchObject({
      kind: 'blur',
      assetId: '',
      name: 'Blur',
      timelineStartMs: 2_000,
      timelineDurationMs: 5_000,
      shape: 'rectangle',
      mode: 'blur',
      strength: 60,
      feather: 0,
      cornerRadius: 0,
      tintOpacity: 0,
    });
    expect(mounted.state.composition.value.assets).toHaveLength(0);

    const legacyBlur = mounted.state.selectedClip.value;
    if (!legacyBlur || legacyBlur.kind !== 'blur') throw new Error('Expected the selected blur clip.');
    delete legacyBlur.cornerRadius;
    expect(() => mounted.state.updateSelectedBlur({ mode: 'frosted', tintOpacity: 24 })).not.toThrow();

    mounted.state.updateSelectedBlur({
      shape: 'circle',
      mode: 'frosted',
      strength: 80,
      feather: 20,
      cornerRadius: 35,
      tintOpacity: 25,
      color: '#abcdef',
    });
    expect(mounted.state.selectedClipInfo.value).toMatchObject({
      blurShape: 'circle',
      blurMode: 'frosted',
      blurStrength: 80,
      blurFeather: 20,
      blurCornerRadius: 35,
      blurTintOpacity: 25,
      blurColor: '#abcdef',
    });
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
    await expect(mounted.state.addElement('video', 4_000)).rejects.toThrow('media input could not be decoded');
    expect(mounted.state.composition.value.clips.filter((clip) => clip.kind === 'video')).toHaveLength(1);
  });

  it('holds an imported video at the playhead and selects the freeze segment', () => {
    const mounted = mountComposable();
    const videoId = mounted.state.addImportedAsset(videoAsset(), videoInspection(false), 0);

    mounted.state.holdClip(videoId, 1_000);

    const videoClips = mounted.state.composition.value.clips
      .filter((clip): clip is VisualClip => clip.kind === 'video')
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs);
    expect(videoClips).toHaveLength(3);
    expect(videoClips.map((clip) => [clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      [0, 1_000],
      [1_000, 1_000],
      [2_000, 1_500],
    ]);

    const freeze = videoClips.find((clip) => clip.freezeFrameSourceMs !== undefined);
    expect(freeze).toMatchObject({
      timelineStartMs: 1_000,
      timelineDurationMs: 1_000,
      sourceInMs: 1_000,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      freezeFrameSourceMs: 1_000,
    });
    expect(mounted.state.selectedClipId.value).toBe(freeze?.id);
    expect(mounted.state.selectedClip.value?.id).toBe(freeze?.id);
  });

  it('deletes both fragments of a grouped imported video after splitting the selected right video', () => {
    const mounted = mountComposable();
    const videoId = mounted.state.addImportedAsset(
      { ...videoAsset(), durationMs: 127_000 },
      { ...videoInspection(true), durationMs: 127_000 },
      0,
    );
    const originalVideo = mounted.state.composition.value.clips.find((clip) => clip.id === videoId)!;
    const groupId = originalVideo.groupId;
    expect(groupId).toBeTruthy();
    expect(mounted.state.composition.value.clips.filter((clip) => clip.groupId === groupId)).toHaveLength(2);

    mounted.currentTimeSec.value = 120;
    mounted.state.splitSelectedClip();
    const rightVideo = mounted.state.composition.value.clips.find(
      (clip) => clip.kind === 'video' && clip.timelineStartMs === 120_000,
    )!;
    const rightAudio = mounted.state.composition.value.clips.find(
      (clip) => clip.kind === 'audio' && clip.timelineStartMs === 120_000,
    );
    expect(rightAudio?.groupId).toBe(rightVideo.groupId);

    mounted.state.selectClip(rightVideo.id);
    mounted.state.deleteSelectedClip();

    expect(mounted.state.composition.value.clips.some((clip) => clip.id === rightVideo.id)).toBe(false);
    expect(rightAudio && mounted.state.composition.value.clips.some((clip) => clip.id === rightAudio.id)).toBe(false);
    const maxEnd = Math.max(
      0,
      ...mounted.state.composition.value.clips.map((clip) => clip.timelineStartMs + clip.timelineDurationMs),
    );
    expect(maxEnd).toBe(120_000);
  });

  it('places imported visuals above existing visuals and links audio only when decodable', () => {
    const mounted = mountComposable();
    const existingVisual: VisualClip = {
      id: 'existing-image',
      trackId: 'existing-image',
      kind: 'image',
      name: 'Existing image',
      assetId: 'image-asset',
      timelineStartMs: 0,
      timelineDurationMs: 5_000,
      sourceInMs: 0,
      sourceDurationMs: 5_000,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
      enabled: true,
      order: 4,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('image'),
      isMirrored: false,
      isMirroredY: false,
    };
    const current: ClipComposition = mounted.state.composition.value;
    mounted.state.composition.value = {
      ...current,
      assets: [imageAsset()],
      clips: [existingVisual],
    };

    mounted.state.addImportedAsset({ ...videoAsset(), id: 'video-with-audio' }, videoInspection(true), 1_000);
    const linkedVisual = mounted.state.composition.value.clips.find(
      (clip) => clip.kind === 'video' && clip.assetId === 'video-with-audio',
    )!;
    const linkedAudio = mounted.state.composition.value.clips.find(
      (clip) => clip.kind === 'audio' && clip.assetId === 'video-with-audio',
    )!;
    expect(linkedVisual.order).toBeLessThan(existingVisual.order);
    expect(linkedAudio.groupId).toBe(linkedVisual.groupId);
    expect(linkedAudio.timelineStartMs).toBe(1_000);

    mounted.state.addImportedAsset({ ...videoAsset(), id: 'video-without-audio' }, videoInspection(false), 2_000);
    const undecodableClips = mounted.state.composition.value.clips.filter(
      (clip) => clip.kind === 'video' && clip.assetId === 'video-without-audio',
    );
    expect(undecodableClips).toHaveLength(1);
    expect(undecodableClips[0]?.kind).toBe('video');
    const linkedVisualAfterSecondAdd = mounted.state.composition.value.clips.find(
      (clip) => clip.kind === 'video' && clip.assetId === 'video-with-audio',
    )!;
    expect(undecodableClips[0]?.order).toBeLessThan(linkedVisualAfterSecondAdd.order);
  });

  it('rejects a video whose native metadata has no readable duration', async () => {
    const mounted = mountComposable();
    mockMediaMetadata(0);
    capture.pickProjectMedia.mockResolvedValueOnce({ ...videoAsset(), id: 'broken', name: 'Broken' });
    await expect(mounted.state.addElement('video')).rejects.toThrow('aucune durée exploitable');
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
    expect(() => mounted.state.updateSelectedVolume(150)).not.toThrow();
    mounted.state.updateSelectedEnabled(false);
    expect(mounted.state.selectedClipInfo.value).toMatchObject({
      borderEnabled: true,
      frame: 'safari',
      isMirrored: true,
      playbackRate: 2,
      enabled: false,
    });

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

  it('allows extending and trimming caption clips beyond their initial duration', async () => {
    const mounted = mountComposable();
    await mounted.state.addElement('caption', 1_000);
    const captionId = mounted.state.selectedClipId.value!;
    const initialClip = mounted.state.selectedClip.value!;
    expect(initialClip.timelineStartMs).toBe(1_000);

    // Extend end boundary to 8,000ms
    mounted.state.trimClipEdge(captionId, 'end', 8_000);
    expect(mounted.state.selectedClip.value?.timelineStartMs).toBe(1_000);
    expect(mounted.state.selectedClip.value?.timelineDurationMs).toBe(7_000);

    // Extend start boundary backwards to 0ms
    mounted.state.trimClipEdge(captionId, 'start', 0);
    expect(mounted.state.selectedClip.value?.timelineStartMs).toBe(0);
    expect(mounted.state.selectedClip.value?.timelineDurationMs).toBe(8_000);

    // Shorten end boundary to 3,000ms
    mounted.state.trimClipEdge(captionId, 'end', 3_000);
    expect(mounted.state.selectedClip.value?.timelineStartMs).toBe(0);
    expect(mounted.state.selectedClip.value?.timelineDurationMs).toBe(3_000);
  });

  it('clamps finite caption durations to 200ms and ignores non-finite requests', async () => {
    const mounted = mountComposable();

    await mounted.state.addCaptionAtTime({ startMs: 1_000, durationMs: 100 });
    expect(mounted.state.composition.value.clips).toHaveLength(1);
    expect(mounted.state.selectedCaptionClip.value).toMatchObject({
      timelineDurationMs: 200,
      sourceDurationMs: 200,
    });

    await mounted.state.addCaptionAtTime({ startMs: 2_000, durationMs: Number.NaN });
    await mounted.state.addCaptionAtTime({ startMs: 3_000, durationMs: Number.POSITIVE_INFINITY });

    expect(mounted.state.composition.value.clips).toHaveLength(1);
  });
});
