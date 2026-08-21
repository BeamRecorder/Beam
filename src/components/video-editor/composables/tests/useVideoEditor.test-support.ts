import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import {
  COMPOSITION_SCHEMA_VERSION,
  type AudioClip,
  type ClipComposition,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';

export const cloneComposition = (value: ClipComposition): ClipComposition =>
  JSON.parse(JSON.stringify(value)) as ClipComposition;

const mediaAsset = (id: string, kind: MediaAsset['kind'], overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : kind === 'image' ? 'png' : 'mp4'}`,
  durationMs: 5_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `project-media://project-1/${id}`,
  origin: 'project',
  ...overrides,
});

const videoClip = (id: string, assetId: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  trackId: id,
  kind: 'video',
  name: id,
  assetId,
  timelineStartMs: 1_000,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: -1,
  transform: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
  crop: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

export const audioClip = (id: string, assetId: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId,
  role: 'imported',
  timelineStartMs: 1_000,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 2,
  volume: 100,
  ...overrides,
});

export const createCompositionFixture = (): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  keyboardCaptionSessions: [],
  assets: [
    mediaAsset('screen-asset', 'video', { origin: 'session', sessionId: 'session-1' }),
    mediaAsset('video-asset', 'video'),
    mediaAsset('audio-asset', 'audio'),
  ],
  clips: [
    videoClip('screen', 'screen-asset', {
      kind: 'screen',
      name: 'Screen recording',
      timelineStartMs: 0,
      timelineDurationMs: 5_000,
      sourceDurationMs: 5_000,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('screen'),
    }),
    videoClip('imported-video', 'video-asset'),
    audioClip('imported-audio', 'audio-asset'),
  ],
});

type CompositionMutation = (composition: ClipComposition) => void;

export const visualMutations: Array<[string, CompositionMutation]> = [
  [
    'transform',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.transform = { x: 0.2, y: 0.15, width: 0.4, height: 0.35 };
    },
  ],
  [
    'appearance',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.appearance = { ...clip.appearance, frame: 'safari', shadowSize: 'lg' };
    },
  ],
  [
    'crop',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.crop = { x: 0.1, y: 0.15, width: 0.75, height: 0.7 };
    },
  ],
  [
    'mirror',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.isMirrored = true;
      clip.isMirroredY = true;
    },
  ],
  [
    'order',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.order = -4;
    },
  ],
  [
    'name',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.name = 'Renamed imported video';
    },
  ],
];

export const playbackMutations: Array<[string, CompositionMutation]> = [
  [
    'asset source',
    (composition) => {
      composition.assets.find((asset) => asset.id === 'video-asset')!.src =
        'project-media://project-1/replaced-video.mp4';
    },
  ],
  [
    'timeline start',
    (composition) => {
      composition.clips.find((clip) => clip.id === 'imported-video')!.timelineStartMs = 1_250;
    },
  ],
  [
    'source in',
    (composition) => {
      composition.clips.find((clip) => clip.id === 'imported-video')!.sourceInMs = 500;
    },
  ],
  [
    'timeline duration',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video')!;
      clip.timelineDurationMs = 2_500;
      clip.sourceDurationMs = 2_500;
    },
  ],
  [
    'playback rate',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video')!;
      clip.playbackRate = 1.5;
      clip.timelineDurationMs = 2_000;
    },
  ],
  [
    'enabled',
    (composition) => {
      composition.clips.find((clip) => clip.id === 'imported-video')!.enabled = false;
    },
  ],
  [
    'audio volume',
    (composition) => {
      (composition.clips.find((clip) => clip.id === 'imported-audio') as AudioClip).volume = 55;
    },
  ],
  [
    'add video',
    (composition) => {
      composition.assets.push(mediaAsset('added-video-asset', 'video'));
      composition.clips.push(videoClip('added-video', 'added-video-asset', { timelineStartMs: 0 }));
    },
  ],
  [
    'add audio',
    (composition) => {
      composition.assets.push(mediaAsset('added-audio-asset', 'audio'));
      composition.clips.push(audioClip('added-audio', 'added-audio-asset', { timelineStartMs: 0 }));
    },
  ],
  [
    'remove video',
    (composition) => {
      composition.clips = composition.clips.filter((clip) => clip.id !== 'imported-video');
      composition.assets = composition.assets.filter((asset) => asset.id !== 'video-asset');
    },
  ],
  [
    'remove audio',
    (composition) => {
      composition.clips = composition.clips.filter((clip) => clip.id !== 'imported-audio');
      composition.assets = composition.assets.filter((asset) => asset.id !== 'audio-asset');
    },
  ],
];
