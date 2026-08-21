import type { Mock } from 'vitest';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { MediaError, MediaSourceDescriptor } from '~/media/shared/media-types';

export type FakeWaveformWorkerInstance = {
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  postMessage: Mock<(message: unknown) => void>;
  terminate: Mock<() => void>;
};

export type WaveformWorkerRequest =
  | {
      type: 'extract';
      generation: number;
      clipId: string;
      source: MediaSourceDescriptor;
      startSeconds: number;
      endSeconds: number;
      pointCount: number;
      segmentIndex: number;
      segmentCount: number;
    }
  | { type: 'clear'; generation: number };
export type ExtractWaveformWorkerRequest = Extract<WaveformWorkerRequest, { type: 'extract' }>;

export type WaveformWorkerResponse =
  | {
      type: 'result';
      generation: number;
      clipId: string;
      peaks: Float32Array;
      segmentIndex: number;
      segmentCount: number;
      segmentPointOffset: number;
      segmentComplete: boolean;
    }
  | { type: 'error'; generation: number; clipId: string; error: MediaError };

export const composition = (volume = 100, source = 'https://media.test/sound.mp4'): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    {
      id: 'audio',
      kind: 'audio',
      name: 'Sound',
      fileName: 'sound.mp4',
      durationMs: 2_000,
      width: null,
      height: null,
      src: source,
      origin: 'project',
    },
  ],
  clips: [
    {
      id: 'clip',
      kind: 'audio',
      name: 'Sound',
      assetId: 'audio',
      role: 'imported',
      timelineStartMs: 0,
      timelineDurationMs: 1_000,
      sourceInMs: 250,
      sourceDurationMs: 1_000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      volume,
    },
  ],
});

export const twoAudioClipComposition = () => {
  const value = composition();
  const firstAsset = value.assets[0]!;
  const secondAsset = { ...firstAsset, id: 'audio-2', src: 'https://media.test/second.mp4' };
  const firstClip = value.clips[0]!;
  const secondClip = { ...firstClip, id: 'clip-2', assetId: secondAsset.id, name: 'Second sound' };
  return { ...value, assets: [...value.assets, secondAsset], clips: [firstClip, secondClip] };
};

export const requests = (instances: readonly FakeWaveformWorkerInstance[]) =>
  instances.flatMap((instance) => instance.postMessage.mock.calls.map(([message]) => message as WaveformWorkerRequest));

export const extractRequests = (
  instances: readonly FakeWaveformWorkerInstance[],
  clipId: string,
  generation?: number,
): ExtractWaveformWorkerRequest[] =>
  requests(instances)
    .filter(
      (message): message is ExtractWaveformWorkerRequest =>
        message.type === 'extract' &&
        message.clipId === clipId &&
        (generation === undefined || message.generation === generation),
    )
    .sort((left, right) => left.segmentIndex - right.segmentIndex);

export const latestGeneration = (instances: readonly FakeWaveformWorkerInstance[], clipId = 'clip') => {
  const values = extractRequests(instances, clipId).map((request) => request.generation);
  if (values.length === 0) throw new Error(`No extraction request found for ${clipId}.`);
  return Math.max(...values);
};

export const segmentPeaks = (pointCount: number, maximum: number) =>
  Float32Array.from({ length: pointCount * 2 }, (_, index) => (index % 2 === 0 ? 0 : maximum));

export const segmentOffset = (segments: readonly ExtractWaveformWorkerRequest[], index: number) =>
  segments.slice(0, index).reduce((sum, segment) => sum + segment.pointCount, 0);

export const respond = (instances: readonly FakeWaveformWorkerInstance[], response: WaveformWorkerResponse) => {
  instances[0]?.onmessage?.({ data: response } as MessageEvent<WaveformWorkerResponse>);
};

export const respondChunk = (
  instances: readonly FakeWaveformWorkerInstance[],
  request: ExtractWaveformWorkerRequest,
  pointOffset: number,
  pointCount: number,
  maximum: number,
  complete: boolean,
) => {
  respond(instances, {
    type: 'result',
    generation: request.generation,
    clipId: request.clipId,
    segmentIndex: request.segmentIndex,
    segmentCount: request.segmentCount,
    segmentPointOffset: pointOffset,
    segmentComplete: complete,
    peaks: segmentPeaks(pointCount, maximum),
  });
};

export const respondSegment = (
  instances: readonly FakeWaveformWorkerInstance[],
  request: ExtractWaveformWorkerRequest,
  maximum: number,
) => {
  respond(instances, {
    type: 'result',
    generation: request.generation,
    clipId: request.clipId,
    segmentIndex: request.segmentIndex,
    segmentCount: request.segmentCount,
    segmentPointOffset: 0,
    segmentComplete: true,
    peaks: segmentPeaks(request.pointCount, maximum),
  });
};

export const respondAllSegments = (
  instances: readonly FakeWaveformWorkerInstance[],
  clipId: string,
  generation: number,
  maximums: readonly number[] = [2, 2, 2],
  order: readonly number[] = [0, 1, 2],
) => {
  const segments = extractRequests(instances, clipId, generation);
  if (segments.length !== 3) throw new Error(`Expected three segments for ${clipId}.`);
  for (const index of order) respondSegment(instances, segments[index]!, maximums[index] ?? 2);
  return segments;
};
