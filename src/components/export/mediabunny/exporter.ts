import { AudioBufferSource, CanvasSource, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from "mediabunny";
import { bitrateFor } from "../export-presets";
import type { ExportProgress, ExportRequest, ExportResult } from "../export-types";
import { renderCompositionFrame } from "../composition/render";
import { activeClipsAt, sourceTimeAt } from "../../video-editor/composition/engine/clip-engine";
import { isAudioClip, isVisualClip, type AudioClip, type VisualClip } from "../../video-editor/composition/composition-types";
import { cursorTypeForKind, useCursorReplacer } from "../../video-editor/properties/cursor/useCursorReplacer";
import { VideoFrameProvider } from "./video-frame-provider";
import { createCursorMotionPlayer } from "../../video-editor/composables/cursor-motion";
import { tNamespace } from "../../../i18n";

const $t = tNamespace("exporter");
const videoCodecs = { webm: ["vp9", "vp8", "av1"], mp4: ["avc"] } as const;
const audioCodecs = { webm: ["opus"], mp4: ["aac"] } as const;

const screenSourceFor = (request: ExportRequest) => {
  const screen = request.snapshot.composition.clips.find((clip): clip is VisualClip => clip.kind === "screen" && clip.enabled);
  const asset = screen && request.snapshot.composition.assets.find((item) => item.id === screen.assetId);
  if (!screen || !asset?.src) throw new Error($t("sessionVideoUnavailable"));
  return { screen, asset };
};

export const supportedVideoCodec = (request: ExportRequest) => getFirstEncodableVideoCodec([...videoCodecs[request.format]], {
  width: request.snapshot.canvas.width,
  height: request.snapshot.canvas.height,
  bitrate: bitrateFor(request.preset, request.snapshot.canvas.width, request.snapshot.canvas.height, request.snapshot.render.fps),
});

export async function supportedAudioCodec(request: ExportRequest) {
  if (!request.snapshot.composition.clips.some((clip) => isAudioClip(clip) && clip.enabled)) return null;
  return getFirstEncodableAudioCodec([...audioCodecs[request.format]], { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });
}

export async function renderMixedAudio(request: ExportRequest): Promise<AudioBuffer | null> {
  const assets = new Map(request.snapshot.composition.assets.map((asset) => [asset.id, asset]));
  const clips = request.snapshot.composition.clips.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.enabled);
  if (!clips.length) return null;
  if (!window.OfflineAudioContext) throw new Error($t("offlineAudioUnavailable"));
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(request.snapshot.duration * 48_000)), 48_000);
  await Promise.all(clips.map(async (clip) => {
    const asset = assets.get(clip.assetId);
    if (!asset?.src) throw new Error($t("unableToReadAudioSidecar", { src: clip.name }));
    const response = await fetch(asset.src);
    if (!response.ok) throw new Error($t("unableToReadAudioSidecar", { src: asset.src }));
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = clip.playbackRate;
    gain.gain.value = Math.max(0, Math.min(2, clip.volume / 100));
    source.connect(gain).connect(context.destination);
    const offset = Math.min(buffer.duration, clip.sourceInMs / 1_000);
    source.start(clip.timelineStartMs / 1_000, offset, Math.min(Math.max(0, buffer.duration - offset), clip.sourceDurationMs / 1_000));
  }));
  return context.startRendering();
}

const waitFor = (target: HTMLMediaElement, event: "loadedmetadata" | "seeked") => new Promise<void>((resolve, reject) => {
  const cleanup = () => { target.removeEventListener(event, done); target.removeEventListener("error", failed); };
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
      const image = new Image(); image.src = asset.src;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error($t("unableToLoadImage", { name: asset.name }))); });
      images.set(asset.id, image); return;
    }
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.src = asset.src; video.load();
    await waitFor(video, "loadedmetadata"); videos.set(asset.id, video);
  }));
  return { images, videos, dispose: () => videos.forEach((video) => { video.removeAttribute("src"); video.load(); }) };
}

async function visualsAtTime(request: ExportRequest, loaded: Awaited<ReturnType<typeof loadVisuals>>, time: number, decoded: ReadonlySet<string>) {
  const result = new Map<string, CanvasImageSource>(loaded.images);
  for (const clip of activeClipsAt(request.snapshot.composition, time * 1_000)) {
    if (!isVisualClip(clip) || clip.kind === "screen" || decoded.has(clip.assetId)) continue;
    const video = loaded.videos.get(clip.assetId);
    const sourceMs = sourceTimeAt(clip, time * 1_000);
    if (!video || sourceMs === null) continue;
    const local = sourceMs / 1_000;
    if (local < 0 || (Number.isFinite(video.duration) && local >= video.duration)) continue;
    if (Math.abs(video.currentTime - local) > .001) { video.currentTime = local; await waitFor(video, "seeked"); }
    result.set(clip.assetId, video);
  }
  return result;
}

async function loadBackground(request: ExportRequest): Promise<HTMLImageElement | HTMLVideoElement | null> {
  const value = request.snapshot.background;
  if (!value || (value.kind !== "image" && value.kind !== "video")) return null;
  if (value.kind === "image") {
    const image = new Image(); image.src = value.src;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error($t("unableToLoadBackground"))); });
    return image;
  }
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto"; video.src = value.src; video.load();
  await waitFor(video, "loadedmetadata"); return video;
}

async function loadCursorImages(request: ExportRequest) {
  const types = new Set(request.snapshot.cursorSettings.selectedCursor === "automatic"
    ? request.snapshot.cursor.events.filter((event) => event.event === "shape").map((event) => cursorTypeForKind(event.cursorKind))
    : [request.snapshot.cursorSettings.selectedCursor]);
  if (!types.size) types.add("default");
  const { getCursorImage } = useCursorReplacer();
  return new Map(await Promise.all([...types].map(async (type) => [type, await getCursorImage(type, request.snapshot.cursorSettings.size * 6, request.snapshot.cursorSettings.color)] as const)));
}

export async function exportWithMediabunny(request: ExportRequest, onProgress: (progress: ExportProgress) => void, signal: AbortSignal): Promise<ExportResult> {
  const { screen, asset: screenAsset } = screenSourceFor(request);
  const fps = request.snapshot.render.fps;
  const codec = await supportedVideoCodec(request);
  if (!codec) throw new Error($t("formatNotEncodable", { format: request.format.toUpperCase() }));
  const audioCodec = await supportedAudioCodec(request);
  if (request.snapshot.composition.clips.some((clip) => isAudioClip(clip) && clip.enabled) && !audioCodec) throw new Error($t("formatAudioNotEncodable", { format: request.format.toUpperCase() }));
  const opened = await window.capture?.beginExport({ projectName: request.projectName, format: request.format });
  if (!opened || opened.canceled) throw new DOMException($t("exportCancelled"), "AbortError");

  const fallbackVideo = document.createElement("video");
  fallbackVideo.muted = true; fallbackVideo.preload = "auto"; fallbackVideo.src = screenAsset.src;
  const canvas = document.createElement("canvas");
  canvas.width = request.snapshot.canvas.width; canvas.height = request.snapshot.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error($t("canvas2DUnavailable"));
  let sequence = 0;
  const writable = new WritableStream({ write: (chunk: { data: Uint8Array; position: number }) => window.capture!.writeExportChunk({ jobId: opened.jobId, sequence: sequence++, data: chunk.data, position: chunk.position }) });
  const output = new Output({ format: request.format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(), target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }) });
  const source = new CanvasSource(canvas, { codec, bitrate: bitrateFor(request.preset, canvas.width, canvas.height, fps) });
  output.addVideoTrack(source, { frameRate: fps });

  let loaded: Awaited<ReturnType<typeof loadVisuals>> | null = null;
  let screenFrames: VideoFrameProvider | null = null;
  const clipFrames = new Map<string, VideoFrameProvider>();
  try {
    const totalTimeMs = Math.round(request.snapshot.duration * 1_000);
    const total = Math.max(1, Math.ceil(request.snapshot.duration * fps));
    const times = Array.from({ length: total }, (_, frame) => Math.min(request.snapshot.duration, frame / fps));
    onProgress({ stage: "loading_assets", stageLabel: $t("loadingMediaAssets"), completed: 0, total, currentTimeMs: 0, totalTimeMs });
    const background = await loadBackground(request);
    const cursorImages = await loadCursorImages(request);
    const cursorMotionPlayer = createCursorMotionPlayer(
      request.snapshot.cursor.events,
      request.snapshot.cursorSettings.motion,
      request.snapshot.render.sourceWidth,
      request.snapshot.render.sourceHeight,
    );
    loaded = await loadVisuals(request);
    screenFrames = await VideoFrameProvider.create(screenAsset.src, times.map((time) => Math.max(0, (sourceTimeAt(screen, time * 1_000) ?? screen.sourceInMs) / 1_000)));
    if (!screenFrames) { fallbackVideo.load(); await waitFor(fallbackVideo, "loadedmetadata"); }

    const videoAssets = request.snapshot.composition.assets.filter((asset) => asset.kind === "video" && asset.id !== screenAsset.id && asset.src);
    await Promise.all(videoAssets.map(async (asset) => {
      const timestamps = times.map((time) => {
        const clip = activeClipsAt(request.snapshot.composition, time * 1_000).find((item) => isVisualClip(item) && item.assetId === asset.id);
        return clip ? Math.max(0, (sourceTimeAt(clip, time * 1_000) ?? clip.sourceInMs) / 1_000) : 0;
      });
      const provider = await VideoFrameProvider.create(asset.src, timestamps);
      if (provider) clipFrames.set(asset.id, provider);
    }));

    onProgress({ stage: "audio_mixing", stageLabel: $t("mixingAudioTracks"), completed: 0, total, currentTimeMs: 0, totalTimeMs });
    const mixed = await renderMixedAudio(request);
    const audioSource = mixed && audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    if (audioSource && mixed) await audioSource.add(mixed);

    for (let frame = 0; frame < total; frame += 1) {
      if (signal.aborted) throw new DOMException($t("exportCancelled"), "AbortError");
      const time = times[frame];
      const currentTimeMs = Math.round(time * 1_000);
      onProgress({ stage: "encoding", stageLabel: $t("encodingFrame", { frame: frame + 1, total }), completed: frame + 1, total, currentTimeMs, totalTimeMs });
      if (background instanceof HTMLVideoElement && Math.abs(background.currentTime - time) > .001) { background.currentTime = time % Math.max(.001, background.duration); await waitFor(background, "seeked"); }
      const screenMs = sourceTimeAt(screen, currentTimeMs);
      if (!screenFrames && screenMs !== null && Math.abs(fallbackVideo.currentTime - screenMs / 1_000) > .001) { fallbackVideo.currentTime = screenMs / 1_000; await waitFor(fallbackVideo, "seeked"); }
      const screenFrame = screenFrames ? await screenFrames.frameAt(frame) : null;
      const decodedFrames = await Promise.all([...clipFrames].map(async ([assetId, provider]) => [assetId, await provider.frameAt(frame)] as const));
      const decodedIds = new Set(decodedFrames.filter(([, value]) => Boolean(value)).map(([assetId]) => assetId));
      const visuals = await visualsAtTime(request, loaded, time, decodedIds);
      for (const [assetId, value] of decodedFrames) if (value) visuals.set(assetId, value);
      try { renderCompositionFrame(context, screenFrame ?? fallbackVideo, request.snapshot, time, background, cursorImages, visuals, cursorMotionPlayer); }
      finally { screenFrame?.close(); decodedFrames.forEach(([, value]) => value?.close()); }
      await source.add(time, 1 / fps);
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
    loaded?.dispose(); screenFrames?.dispose(); clipFrames.forEach((provider) => provider.dispose());
    fallbackVideo.removeAttribute("src"); fallbackVideo.load();
  }
}
