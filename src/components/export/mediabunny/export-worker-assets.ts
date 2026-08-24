import type { InputAudioTrack, InputVideoTrack } from 'mediabunny';
import { mediaSourceDescriptor, openMediaInput, type OpenedMediaInput } from '~/media/shared';
import {
  isAudioClip,
  isColorClip,
  isVisualClip,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import type { ExportRequest } from '../export-types';

export type ExportAsset = {
  asset: MediaAsset;
  opened: OpenedMediaInput;
  video: InputVideoTrack | null;
  audio: InputAudioTrack | null;
  duration: number;
};

export type ExportAssets = {
  assets: Map<string, ExportAsset>;
  screenSize: { width: number; height: number } | null;
  dispose(): void;
};

const backgroundAsset = (request: ExportRequest): MediaAsset | null => {
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

export async function openExportAssets(
  request: ExportRequest,
  signal: AbortSignal,
  onValidated: (count: number, total: number) => void,
): Promise<ExportAssets> {
  const active = request.snapshot.composition.clips.filter(
    (clip) => clip.enabled && clip.timelineDurationMs > 0 && (request.includeAudio !== false || !isAudioClip(clip)),
  );
  const catalog = new Map(request.snapshot.composition.assets.map((asset) => [asset.id, asset]));
  const required = new Map<string, { asset: MediaAsset; video: boolean; audio: boolean }>();
  for (const clip of active) {
    if (clip.kind === 'caption' || clip.kind === 'image' || isColorClip(clip) || clip.kind === 'blur') continue;
    const asset = catalog.get(clip.assetId);
    if (!asset) throw new Error(`Missing export asset: ${clip.name}.`);
    const entry = required.get(asset.id) ?? { asset, video: false, audio: false };
    entry.video ||= isVisualClip(clip);
    entry.audio ||= isAudioClip(clip);
    required.set(asset.id, entry);
  }
  const background = backgroundAsset(request);
  if (background?.kind === 'video') required.set(background.id, { asset: background, video: true, audio: false });
  const entries = [...required.values()];
  const assets = new Map<string, ExportAsset>();
  const openedInputs = new Set<OpenedMediaInput>();
  let completed = 0;
  let cursor = 0;
  let failed = false;
  let failure: unknown = null;
  const disposeOpened = (opened: OpenedMediaInput) => {
    if (!openedInputs.delete(opened)) return;
    opened.dispose();
  };
  const worker = async () => {
    while (!failed && cursor < entries.length) {
      const entry = entries[cursor++]!;
      if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
      const opened = await openMediaInput(mediaSourceDescriptor(entry.asset));
      openedInputs.add(opened);
      try {
        if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
        if (failed) {
          disposeOpened(opened);
          return;
        }
        const [video, audio] = await Promise.all([
          entry.video ? opened.input.getPrimaryVideoTrack() : Promise.resolve(null),
          entry.audio ? opened.input.getPrimaryAudioTrack() : Promise.resolve(null),
        ]);
        if (entry.video && (!video || !(await video.canDecode())))
          throw new Error(`${entry.asset.name} has no decodable video track.`);
        if (entry.audio && (!audio || !(await audio.canDecode())))
          throw new Error(`${entry.asset.name} has no decodable audio track.`);
        const tracks = [video, audio].filter((track): track is InputVideoTrack | InputAudioTrack => track !== null);
        const metadataDuration = await opened.input.getDurationFromMetadata(tracks);
        const duration = metadataDuration ?? (await opened.input.computeDuration(tracks, { skipLiveWait: true }));
        if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${entry.asset.name} has no valid duration.`);
        if (failed || signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
        assets.set(entry.asset.id, { asset: entry.asset, opened, video, audio, duration });
        completed += 1;
        onValidated(completed, entries.length);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
        disposeOpened(opened);
        throw error;
      }
    }
  };
  const workers = Array.from({ length: Math.min(4, Math.max(1, entries.length)) }, () => worker());
  const results = await Promise.allSettled(workers);
  const rejection = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejection) {
    failed = true;
    for (const opened of [...openedInputs]) disposeOpened(opened);
    assets.clear();
    throw failure ?? rejection.reason;
  }
  try {
    const screenClip = active.find((clip): clip is VisualClip => clip.kind === 'screen');
    const screenTrack = screenClip ? assets.get(screenClip.assetId)?.video : null;
    const screenSize = screenTrack
      ? { width: await screenTrack.getDisplayWidth(), height: await screenTrack.getDisplayHeight() }
      : null;
    return {
      assets,
      screenSize,
      dispose() {
        for (const opened of [...openedInputs]) disposeOpened(opened);
        assets.clear();
      },
    };
  } catch (error) {
    failed = true;
    for (const opened of [...openedInputs]) disposeOpened(opened);
    assets.clear();
    throw error;
  }
}

export async function loadBitmap(src: string, label = 'image asset'): Promise<ImageBitmap> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Unable to load ${label}: HTTP ${response.status}. Source: ${src}`);
  const blob = await response.blob();
  try {
    return await createImageBitmap(blob, {
      premultiplyAlpha: 'premultiply',
      colorSpaceConversion: 'default',
    });
  } catch (error) {
    const decoder = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const mime = response.headers?.get('content-type') || blob.type || 'unknown';
    throw new Error(
      `Unable to decode ${label}. MIME: ${mime}; bytes: ${blob.size}; source: ${src}; decoder: ${decoder}`,
      { cause: error },
    );
  }
}
