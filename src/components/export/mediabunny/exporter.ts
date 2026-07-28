import {
  AudioBufferSource,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
} from "mediabunny";
import { bitrateFor } from "../export-presets";
import type { ExportProgress, ExportRequest, ExportResult } from "../export-types";
import { renderCompositionFrame } from "../composition/render";
import { activeClipsAt, sourceTimeAt } from "../../video-editor/composition/engine/clip-engine";
import { isAudioClip, isVisualClip } from "../../video-editor/composition/composition-types";
import { cursorTypeForKind, useCursorReplacer } from "../../video-editor/properties/cursor/useCursorReplacer";
import { VideoFrameProvider } from "./video-frame-provider";
import { tNamespace } from "../../../i18n";

const $t = tNamespace("exporter");
const codecCandidates = { webm: ["vp9", "vp8", "av1"], mp4: ["avc"] } as const;
const audioCodecCandidates = { webm: ["opus"], mp4: ["aac"] } as const;

export const supportedVideoCodec = (request: ExportRequest) => getFirstEncodableVideoCodec(
  [...codecCandidates[request.format]],
  {
    width: request.snapshot.video.width,
    height: request.snapshot.video.height,
    bitrate: bitrateFor(request.preset, request.snapshot.video.width, request.snapshot.video.height, request.snapshot.video.fps),
  },
);

export async function supportedAudioCodec(request: ExportRequest) {
  if (!request.snapshot.composition.clips.some((clip) => isAudioClip(clip) && clip.enabled)) return null;
  return getFirstEncodableAudioCodec([...audioCodecCandidates[request.format]], { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });
}

export async function renderMixedAudio(request: ExportRequest): Promise<AudioBuffer | null> {
  const assets = new Map(request.snapshot.composition.assets.map((asset) => [asset.id, asset]));
  const clips = request.snapshot.composition.clips.filter((clip) => isAudioClip(clip) && clip.enabled);
  if (clips.length === 0) return null;
  if (!window.OfflineAudioContext) throw new Error($t("offlineAudioUnavailable"));
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(request.snapshot.duration * 48_000)), 48_000);
  await Promise.all(clips.map(async (clip) => {
    const asset = assets.get(clip.assetId);
    if (!asset?.src) throw new Error($t("unableToReadAudioSidecar", { src: clip.name }));
    const response = await fetch(asset.src);
    if (!response.ok) throw new Error($t("unableToReadAudioSidecar", { src: asset.src }));
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clip.playbackRate;
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(2, clip.volume / 100));
    source.connect(gain);
    gain.connect(context.destination);
    const offset = Math.min(buffer.duration, clip.sourceInMs / 1_000);
    const sourceDuration = Math.min(Math.max(0, buffer.duration - offset), clip.sourceDurationMs / 1_000);
    source.start(clip.timelineStartMs / 1_000, offset, sourceDuration);
  }));
  return context.startRendering();
}

const waitFor = (target: HTMLMediaElement, event: "loadedmetadata" | "seeked") => new Promise<void>((resolve, reject) => {
  const cleanup = () => {
    target.removeEventListener(event, done);
    target.removeEventListener("error", failed);
  };
  const done = () => { cleanup(); resolve(); };
  const failed = () => { cleanup(); reject(new Error($t("unableToLoadVideo"))); };
  target.addEventListener(event, done, { once: true });
  target.addEventListener("error", failed, { once: true });
});

async function loadVisuals(request: ExportRequest) {
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  await Promise.all(request.snapshot.composition.assets.filter((asset) => asset.kind !== "audio" && asset.src).map(async (asset) => {
    if (asset.kind === "image") {
      if (/\.gif(?:$|[?#])/i.test(asset.src)) throw new Error($t("gifNotExportable"));
      const image = new Image();
      image.src = asset.src;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error($t("unableToLoadImage", { name: asset.name })));
      });
      images.set(asset.id, image);
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = asset.src;
    video.load();
    await waitFor(video, "loadedmetadata");
    videos.set(asset.id, video);
  }));
  return {
    images,
    videos,
    dispose: () => videos.forEach((video) => { video.removeAttribute("src"); video.load(); }),
  };
}

async function visualsAtTime(
  request: ExportRequest,
  visuals: Awaited<ReturnType<typeof loadVisuals>>,
  time: number,
  decodedAssetIds: ReadonlySet<string>,
) {
  const result = new Map<string, CanvasImageSource>(visuals.images);
  for (const clip of activeClipsAt(request.snapshot.composition, time * 1_000)) {
    if (!isVisualClip(clip) || clip.kind === "screen" || decodedAssetIds.has(clip.assetId)) continue;
    const video = visuals.videos.get(clip.assetId);
    const sourceMs = sourceTimeAt(clip, time * 1_000);
    if (!video || sourceMs === null) continue;
    const localTime = sourceMs / 1_000;
    if (localTime < 0 || (Number.isFinite(video.duration) && localTime >= video.duration)) continue;
    if (Math.abs(video.currentTime - localTime) > .001) {
      video.currentTime = localTime;
      await waitFor(video, "seeked");
    }
    result.set(clip.assetId, video);
  }
  return result;
}

async function loadBackground(request: ExportRequest): Promise<HTMLImageElement | HTMLVideoElement | null> {
  const background = request.snapshot.background;
  if (!background || (background.kind !== "image" && background.kind !== "video")) return null;
  if (background.kind === "image") {
    const image = new Image();
    image.src = background.src;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error($t("unableToLoadBackground")));
    });
    return image;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = background.src;
  video.load();
  await waitFor(video, "loadedmetadata");
  return video;
}

async function loadCursorImages(request: ExportRequest) {
  const types = new Set(request.snapshot.cursorSettings.selectedCursor === "automatic"
    ? request.snapshot.cursor.events.filter((event) => event.event === "shape").map((event) => cursorTypeForKind(event.cursorKind))
    : [request.snapshot.cursorSettings.selectedCursor]);
  if (types.size === 0) types.add("default");
  const { getCursorImage } = useCursorReplacer();
  return new Map(await Promise.all([...types].map(async (type) => [
    type,
    await getCursorImage(type, request.snapshot.cursorSettings.size * 6, request.snapshot.cursorSettings.color),
  ] as const)));
}

export async function exportWithMediabunny(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const codec = await supportedVideoCodec(request);
  if (!codec) throw new Error($t("formatNotEncodable", { format: request.format.toUpperCase() }));
  const audioCodec = await supportedAudioCodec(request);
  if (request.snapshot.composition.clips.some((clip) => isAudioClip(clip) && clip.enabled) && !audioCodec) {
    throw new Error($t("formatAudioNotEncodable", { format: request.format.toUpperCase() }));
  }
  const opened = await window.capture?.beginExport({ projectName: request.projectName, format: request.format });
  if (!opened || opened.canceled) throw new DOMException($t("exportCancelled"), "AbortError");

  const fallbackVideo = document.createElement("video");
  fallbackVideo.muted = true;
  fallbackVideo.preload = "auto";
  fallbackVideo.src = request.snapshot.video.src;
  const canvas = document.createElement("canvas");
  canvas.width = request.snapshot.canvas.width;
  canvas.height = request.snapshot.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error($t("canvas2DUnavailable"));
  let sequence = 0;
  const writable = new WritableStream({
    write: (chunk: { data: Uint8Array; position: number }) => window.capture!.writeExportChunk({
      jobId: opened.jobId,
      sequence: sequence++,
      data: chunk.data,
      position: chunk.position,
    }),
  });
  const output = new Output({
    format: request.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
  });
  const source = new CanvasSource(canvas, {
    codec,
    bitrate: bitrateFor(request.preset, canvas.width, canvas.height, request.snapshot.video.fps),
  });
  output.addVideoTrack(source, { frameRate: request.snapshot.video.fps });

  let loadedVisuals: Awaited<ReturnType<typeof loadVisuals>> | null = null;
  let baseFrames: VideoFrameProvider | null = null;
  const compositionFrames = new Map<string, VideoFrameProvider>();
  try {
    const totalTimeMs = Math.round(request.snapshot.duration * 1_000);
    const total = Math.max(1, Math.ceil(request.snapshot.duration * request.snapshot.video.fps));
    const frameTimes = Array.from({ length: total }, (_, frame) => Math.min(request.snapshot.duration, frame / request.snapshot.video.fps));
    onProgress({ stage: "loading_assets", stageLabel: $t("loadingMediaAssets"), completed: 0, total, currentTimeMs: 0, totalTimeMs });
    const background = await loadBackground(request);
    const cursorImages = await loadCursorImages(request);
    loadedVisuals = await loadVisuals(request);
    const screen = request.snapshot.composition.clips.find((clip) => clip.id === request.snapshot.video.clipId);
    const baseTimestamps = frameTimes.map((time) => screen ? Math.max(0, (sourceTimeAt(screen, time * 1_000) ?? screen.sourceInMs) / 1_000) : time);
    baseFrames = await VideoFrameProvider.create(request.snapshot.video.src, baseTimestamps);
    if (!baseFrames) { fallbackVideo.load(); await waitFor(fallbackVideo, "loadedmetadata"); }

    const videoAssets = request.snapshot.composition.assets.filter((asset) => asset.kind === "video" && asset.id !== request.snapshot.video.assetId && asset.src);
    await Promise.all(videoAssets.map(async (asset) => {
      const timestamps = frameTimes.map((time) => {
        const clip = activeClipsAt(request.snapshot.composition, time * 1_000).find((entry) => isVisualClip(entry) && entry.assetId === asset.id);
        return clip ? Math.max(0, (sourceTimeAt(clip, time * 1_000) ?? clip.sourceInMs) / 1_000) : 0;
      });
      const provider = await VideoFrameProvider.create(asset.src, timestamps);
      if (provider) compositionFrames.set(asset.id, provider);
    }));

    onProgress({ stage: "audio_mixing", stageLabel: $t("mixingAudioTracks"), completed: 0, total, currentTimeMs: 0, totalTimeMs });
    const mixedAudio = await renderMixedAudio(request);
    const audioSource = mixedAudio && audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    if (audioSource && mixedAudio) await audioSource.add(mixedAudio);

    for (let frame = 0; frame < total; frame += 1) {
      if (signal.aborted) throw new DOMException($t("exportCancelled"), "AbortError");
      const time = frameTimes[frame];
      const currentTimeMs = Math.round(time * 1_000);
      onProgress({ stage: "encoding", stageLabel: $t("encodingFrame", { frame: frame + 1, total }), completed: frame + 1, total, currentTimeMs, totalTimeMs });
      if (background instanceof HTMLVideoElement && Math.abs(background.currentTime - time) > .001) {
        background.currentTime = time % Math.max(.001, background.duration);
        await waitFor(background, "seeked");
      }
      const sourceMs = screen ? sourceTimeAt(screen, currentTimeMs) : currentTimeMs;
      const sourceSeconds = Math.max(0, (sourceMs ?? 0) / 1_000);
      if (!baseFrames && Math.abs(fallbackVideo.currentTime - sourceSeconds) > .001) {
        fallbackVideo.currentTime = sourceSeconds;
        await waitFor(fallbackVideo, "seeked");
      }
      const baseFrame = baseFrames ? await baseFrames.frameAt(frame) : null;
      const visualFrames = await Promise.all([...compositionFrames].map(async ([assetId, provider]) => [assetId, await provider.frameAt(frame)] as const));
      const decodedAssetIds = new Set(visualFrames.filter(([, visualFrame]) => Boolean(visualFrame)).map(([assetId]) => assetId));
      const visuals = await visualsAtTime(request, loadedVisuals, time, decodedAssetIds);
      for (const [assetId, visualFrame] of visualFrames) if (visualFrame) visuals.set(assetId, visualFrame);
      try {
        renderCompositionFrame(context, baseFrame ?? fallbackVideo, request.snapshot, time, background, cursorImages, visuals);
      } finally {
        baseFrame?.close();
        visualFrames.forEach(([, visualFrame]) => visualFrame?.close());
      }
      await source.add(time, 1 / request.snapshot.video.fps);
    }

    onProgress({ stage: "finalizing", stageLabel: $t("finalizingMediaFile"), completed: total, total, currentTimeMs: totalTimeMs, totalTimeMs });
    await output.finalize();
    const result = await window.capture!.finalizeExport(opened.jobId);
    return { path: result.path, format: request.format };
  } catch (error) {
    await output.cancel().catch(() => undefined);
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw error;
  } finally {
    loadedVisuals?.dispose();
    baseFrames?.dispose();
    compositionFrames.forEach((provider) => provider.dispose());
    fallbackVideo.removeAttribute("src");
    fallbackVideo.load();
  }
}
