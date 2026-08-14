import { isAudioClip, isVisualClip, type Clip, type MediaAsset } from '~/media/shared/composition-types';
import { MediaInputError, mediaSourceDescriptor, openMediaInput } from '~/media/shared';
import { mixCompositionAudio } from '~/media/export';
import {
  ExportValidationError,
  type ExportRequest,
  type ExportValidationCode,
  type PreparedExport,
} from '../export-types';
import type { RenderableMedia } from '../composition/render';

const expectedPath = (asset: MediaAsset) =>
  asset.origin === 'project'
    ? asset.fileName
      ? `media/${asset.fileName}`
      : undefined
    : asset.sessionPath
      ? `sessions/${asset.sessionId}/${asset.sessionPath}`
      : undefined;

const issue = (code: ExportValidationCode, message: string, clip?: Clip, asset?: MediaAsset, codec?: string | null) =>
  new ExportValidationError({
    code,
    message,
    ...(asset ? { assetId: asset.id, name: asset.name, expectedPath: expectedPath(asset) } : {}),
    ...(clip ? { clipId: clip.id, name: clip.name } : {}),
    ...(codec !== undefined ? { codec } : {}),
  });

export const exportValidationFromMediaError = (error: unknown, clip: Clip | undefined, asset: MediaAsset) => {
  if (!(error instanceof MediaInputError))
    return issue('decode-failure', 'The media source could not be decoded.', clip, asset);
  const code: ExportValidationCode =
    error.detail.kind === 'unsupported-codec'
      ? 'unsupported-codec'
      : error.detail.kind === 'invalid-container'
        ? 'unsupported-format'
        : error.detail.kind === 'decode-failure'
          ? 'decode-failure'
          : 'invalid-source';
  return issue(
    code,
    error.detail.message,
    clip,
    asset,
    error.detail.kind === 'unsupported-codec' ? error.detail.codec : undefined,
  );
};

const isGif = (asset: Pick<MediaAsset, 'fileName' | 'name' | 'src'>) =>
  [asset.fileName, asset.name, asset.src].some((value) => typeof value === 'string' && /\.gif(?:$|[?#])/i.test(value));

const assertApprovedUrl = (src: string, clip: Clip | undefined, asset: MediaAsset) => {
  let url: URL;
  try {
    url = new URL(src, globalThis.location?.href);
  } catch {
    throw issue('invalid-source', 'The media asset URL is invalid.', clip, asset);
  }
  if (!['http:', 'https:', 'project-media:'].includes(url.protocol))
    throw issue('invalid-source', 'The media asset does not use an approved project URL.', clip, asset);
};

const loadImage = (src: string, clip: Clip | undefined, asset: MediaAsset) =>
  new Promise<RenderableMedia>((resolve, reject) => {
    if (!src) {
      reject(issue('missing-asset', 'The image source is unavailable.', clip, asset));
      return;
    }
    try {
      assertApprovedUrl(src, clip, asset);
    } catch (error) {
      reject(error);
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(issue('decode-failure', 'The image has invalid dimensions.', clip, asset));
        return;
      }
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(issue('decode-failure', 'The image source could not be decoded.', clip, asset));
    image.src = src;
  });

async function inspectTrack(
  clip: Clip | undefined,
  asset: MediaAsset,
): Promise<{ fps: number; width: number; height: number; duration: number } | null> {
  const kind = clip && isAudioClip(clip) ? 'audio' : 'video';
  let opened: Awaited<ReturnType<typeof openMediaInput>> | null = null;
  try {
    opened = await openMediaInput({ ...mediaSourceDescriptor(asset), kind });
    if (kind === 'audio') {
      const track = await opened.input.getPrimaryAudioTrack();
      if (!track) throw issue('invalid-source', 'The source has no audio track.', clip, asset);
      if (!(await track.canDecode()))
        throw issue('unsupported-codec', 'The audio codec is not supported.', clip, asset, await track.getCodec());
      return null;
    }
    const track = await opened.input.getPrimaryVideoTrack();
    if (!track) throw issue('invalid-source', 'The source has no video track.', clip, asset);
    if (!(await track.canDecode()))
      throw issue('unsupported-codec', 'The video codec is not supported.', clip, asset, await track.getCodec());
    const stats = await track.computePacketStats(100);
    const fps = stats.averagePacketRate;
    if (!Number.isFinite(fps) || fps <= 0 || fps > 240)
      throw issue('fps-unavailable', 'The source frame rate is unavailable or cannot be encoded.', clip, asset);
    const duration = await opened.input.computeDuration([track]);
    if (!Number.isFinite(duration) || duration <= 0)
      throw issue('invalid-source', 'The video duration is unavailable.', clip, asset);
    return {
      fps: Number(fps.toFixed(3)),
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
      duration,
    };
  } catch (error) {
    if (error instanceof ExportValidationError) throw error;
    throw exportValidationFromMediaError(error, clip, asset);
  } finally {
    opened?.dispose();
  }
}

const backgroundAsset = (request: ExportRequest): (MediaAsset & { kind: 'image' | 'video' }) | null => {
  const background = request.snapshot.background;
  if (!background || background.kind === 'color' || background.kind === 'gradient') return null;
  return {
    id: 'export-background',
    kind: background.kind,
    name: 'Background',
    fileName: null,
    durationMs: Math.round(request.snapshot.duration * 1_000),
    width: null,
    height: null,
    src: background.src,
    origin: 'project',
  };
};

export async function prepareExport(request: ExportRequest): Promise<PreparedExport> {
  const composition = request.snapshot.composition;
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const active = composition.clips.filter((clip) => clip.enabled && clip.timelineDurationMs > 0);
  const images = new Map<string, RenderableMedia>();
  const frameRates: number[] = [];
  let screenSize: { width: number; height: number } | null = null;

  for (const clip of active) {
    if (clip.kind === 'caption') continue;
    const asset = assets.get(clip.assetId);
    if (!asset) throw issue('missing-asset', 'The clip references a missing media asset.', clip);
    if (isGif(asset)) throw issue('unsupported-format', 'GIF not supported', clip, asset);
    if (isVisualClip(clip) && clip.kind === 'image') {
      if (!images.has(asset.id)) images.set(asset.id, await loadImage(asset.src, clip, asset));
      continue;
    }
    const video = await inspectTrack(clip, asset);
    if (video) {
      frameRates.push(video.fps);
      if (clip.kind === 'screen') screenSize = { width: video.width, height: video.height };
    }
  }

  let backgroundImage: RenderableMedia | null = null;
  let backgroundVideoDuration: number | null = null;
  const background = backgroundAsset(request);
  if (background) {
    if (isGif(background)) throw issue('unsupported-format', 'GIF not supported', undefined, background);
    if (background.kind === 'image') backgroundImage = await loadImage(background.src, undefined, background);
    else {
      const video = await inspectTrack(undefined, background);
      if (video) {
        frameRates.push(video.fps);
        backgroundVideoDuration = video.duration;
      }
    }
  }

  const fps = frameRates.length ? Math.max(...frameRates) : 30;
  const mixedAudio = await mixCompositionAudio(composition, request.snapshot.duration).catch((error: unknown) => {
    if (error instanceof ExportValidationError) throw error;
    if (error instanceof MediaInputError) {
      const asset = assets.get(error.detail.sourceId);
      const clip = active.find((entry) => entry.kind !== 'caption' && entry.assetId === error.detail.sourceId);
      if (asset) throw exportValidationFromMediaError(error, clip, asset);
    }
    throw new ExportValidationError({
      code: 'decode-failure',
      message: error instanceof Error ? error.message : 'Audio decoding failed.',
    });
  });
  return {
    fps,
    activeClipIds: new Set(active.map((clip) => clip.id)),
    images,
    backgroundImage,
    backgroundVideoDuration,
    mixedAudio,
    screenSize,
    dispose() {
      images.clear();
    },
  };
}

export const safeExportErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Export failed.';
  return message
    .replace(/file:\/\/\/[^\s)]+/gi, '[local path]')
    .replace(/[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]+/g, '[local path]')
    .replace(/\/(?:home|Users|tmp|var)\/[^\s)]+/g, '[local path]');
};

export const technicalExportError = (error: unknown) => {
  const issue = error instanceof ExportValidationError ? error.issue : null;
  const safeMessage = safeExportErrorMessage(error);
  return issue ? JSON.stringify({ ...issue, message: safeMessage }, null, 2) : safeMessage;
};
