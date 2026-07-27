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
import type {
  ExportProgress,
  ExportRequest,
  ExportResult,
} from "../export-types";
import { renderCompositionFrame } from "../composition/render";
import { activeLayersAt, type MediaCompositionLayer } from "../../video-editor/composition/composition-types";
import { cursorTypeForKind, useCursorReplacer } from "../../video-editor/properties/cursor/useCursorReplacer";
import { VideoFrameProvider } from "./video-frame-provider";

const codecCandidates = { webm: ["vp9", "vp8", "av1"], mp4: ["avc"] } as const;
const audioCodecCandidates = { webm: ["opus"], mp4: ["aac"] } as const;

export async function supportedVideoCodec(request: ExportRequest) {
  const { video } = request.snapshot;
  return getFirstEncodableVideoCodec([...codecCandidates[request.format]], {
    width: video.width,
    height: video.height,
    bitrate: bitrateFor(request.preset, video.width, video.height, video.fps),
  });
}

export async function supportedAudioCodec(request: ExportRequest) {
  if (
    request.snapshot.audio.length === 0 &&
    !request.snapshot.composition.layers.some(
      (layer) => layer.kind === "audio" && layer.enabled,
    )
  )
    return null;
  return getFirstEncodableAudioCodec(
    [...audioCodecCandidates[request.format]],
    { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 },
  );
}

export async function renderMixedAudio(
  request: ExportRequest,
): Promise<AudioBuffer | null> {
  const layers = request.snapshot.audio
    .filter((layer) => layer.enabled)
    .map((layer) => ({ ...layer, endSeconds: request.snapshot.duration }));
  const assets = new Map(
    request.snapshot.composition.media.map((asset) => [asset.id, asset]),
  );
  for (const layer of request.snapshot.composition.layers) {
    if (!layer.enabled || layer.kind !== "audio") continue;
    const asset = assets.get(layer.assetId);
    if (asset)
      layers.push({
        id: layer.id,
        src: asset.src,
        startSeconds: Math.max(0, layer.startMs / 1000),
        endSeconds: Math.max(0, layer.endMs / 1000),
        enabled: true,
        sourceOffsetSeconds: Math.max(0, (layer.sourceOffsetMs ?? 0) / 1000),
        timelineDurationSeconds: Math.max(0, (layer.endMs - layer.startMs) / 1000),
        playbackRate: layer.playbackRate ?? 1,
      });
  }
  if (layers.length === 0) return null;
  if (!window.OfflineAudioContext)
    throw new Error(
      "Offline audio mixing is unavailable in this Chromium build.",
    );
  const context = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(request.snapshot.duration * 48_000)),
    48_000,
  );
  await Promise.all(
    layers.map(async (layer) => {
      const response = await fetch(layer.src);
      if (!response.ok)
        throw new Error(`Unable to read the audio sidecar: ${layer.src}`);
      const buffer = await context.decodeAudioData(
        await response.arrayBuffer(),
      );
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const available = Math.max(0, buffer.duration);
      const offset = Math.min(available, Math.max(0, layer.sourceOffsetSeconds ?? 0));
      const rate = Math.max(.25, Math.min(4, layer.playbackRate ?? 1));
      const requested = Math.max(0, layer.timelineDurationSeconds ?? layer.endSeconds - layer.startSeconds);
      source.playbackRate.value = rate;
      source.start(
        Math.max(0, layer.startSeconds),
        offset,
        Math.min(Math.max(0, available - offset), requested * rate),
      );
    }),
  );
  return context.startRendering();
}

async function loadVisuals(request: ExportRequest) {
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  await Promise.all(
    request.snapshot.composition.media
      .filter((asset) => asset.kind !== "audio")
      .map(async (asset) => {
        if (asset.kind === "image") {
          if (/\.gif(?:$|[?#])/i.test(asset.src))
            throw new Error(
              "Les GIF animés ne sont pas encore exportables de manière déterministe.",
            );
          const image = new Image();
          image.src = asset.src;
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () =>
              reject(
                new Error(`Impossible de charger l’image : ${asset.name}`),
              );
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
      }),
  );
  return {
    images,
    videos,
    dispose: () =>
      videos.forEach((video) => {
        video.removeAttribute("src");
        video.load();
      }),
  };
}

async function visualsAtTime(
  request: ExportRequest,
  visuals: Awaited<ReturnType<typeof loadVisuals>>,
  time: number,
  decodedAssetIds: ReadonlySet<string>,
) {
  const result = new Map<string, CanvasImageSource>(visuals.images);
  for (const layer of activeLayersAt(request.snapshot.composition, time * 1000)) {
    if (layer.kind !== "video" || decodedAssetIds.has(layer.assetId)) continue;
    const video = visuals.videos.get(layer.assetId);
    const localTime = (time - layer.startMs / 1000) * (layer.playbackRate ?? 1) + (layer.sourceOffsetMs ?? 0) / 1000;
    if (!video || localTime < 0 || (Number.isFinite(video.duration) && localTime >= video.duration)) continue;
    if (Math.abs(video.currentTime - localTime) > 0.001) {
      video.currentTime = localTime;
      await waitFor(video, "seeked");
    }
    result.set(layer.assetId, video);
  }
  return result;
}

const waitFor = (
  target: HTMLMediaElement,
  event: "loadedmetadata" | "seeked",
) =>
  new Promise<void>((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Impossible de lire la vidéo source."));
    };
    const cleanup = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", failed);
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", failed, { once: true });
  });

async function loadBackground(
  request: ExportRequest,
): Promise<HTMLImageElement | HTMLVideoElement | null> {
  const background = request.snapshot.background;
  if (
    !background ||
    (background.kind !== "image" && background.kind !== "video")
  )
    return null;
  if (background.kind === "image") {
    const image = new Image();
    image.src = background.src;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Impossible de charger le fond."));
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
  const types = new Set(
    request.snapshot.cursorSettings.selectedCursor === "automatic"
      ? request.snapshot.cursor.events
        .filter((event) => event.event === "shape")
        .map((event) => cursorTypeForKind(event.cursorKind))
      : [request.snapshot.cursorSettings.selectedCursor],
  );
  if (types.size === 0) types.add("default");
  const { getCursorImage } = useCursorReplacer();
  const images = await Promise.all([...types].map(async (type) => [
    type,
    await getCursorImage(type, request.snapshot.cursorSettings.size * 6, request.snapshot.cursorSettings.color),
  ] as const));
  return new Map(images);
}

export async function exportWithMediabunny(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const codec = await supportedVideoCodec(request);
  if (!codec)
    throw new Error(
      `${request.format.toUpperCase()} n’est pas encodable par cette machine.`,
    );
  const audioCodec = await supportedAudioCodec(request);
  if ((request.snapshot.audio.length > 0 || request.snapshot.composition.layers.some((layer) => layer.kind === 'audio' && layer.enabled)) && !audioCodec)
    throw new Error(
      `${request.format.toUpperCase()} audio is not encodable by this machine.`,
    );
  const opened = await window.capture?.beginExport({
    projectName: request.projectName,
    format: request.format,
  });
  if (!opened || opened.canceled)
    throw new DOMException("Export annulé.", "AbortError");
  const fallbackVideo = document.createElement("video");
  fallbackVideo.muted = true;
  fallbackVideo.preload = "auto";
  fallbackVideo.src = request.snapshot.video.src;
  const canvas = document.createElement("canvas");
  canvas.width = request.snapshot.canvas.width;
  canvas.height = request.snapshot.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponible.");
  let sequence = 0;
  const writable = new WritableStream({
    write: (chunk: { data: Uint8Array; position: number }) =>
      window.capture!.writeExportChunk({
        jobId: opened.jobId,
        sequence: sequence++,
        data: chunk.data,
        position: chunk.position,
      }),
  });
  const output = new Output({
    format:
      request.format === "webm"
        ? new WebMOutputFormat()
        : new Mp4OutputFormat(),
    target: new StreamTarget(writable, {
      chunked: true,
      chunkSize: 4 * 1024 * 1024,
    }),
  });
  const source = new CanvasSource(canvas, {
    codec,
    bitrate: bitrateFor(
      request.preset,
      canvas.width,
      canvas.height,
      request.snapshot.video.fps,
    ),
  });
  output.addVideoTrack(source, { frameRate: request.snapshot.video.fps });
  let compositionVisuals: Awaited<ReturnType<typeof loadVisuals>> | null = null;
  let baseFrames: VideoFrameProvider | null = null;
  const compositionFrames = new Map<string, VideoFrameProvider>();
  try {
    const totalTimeMs = Math.round(request.snapshot.duration * 1000);
    const total = Math.max(
      1,
      Math.ceil(request.snapshot.duration * request.snapshot.video.fps),
    );

    onProgress({
      stage: "loading_assets",
      stageLabel: "Loading media assets...",
      completed: 0,
      total,
      currentTimeMs: 0,
      totalTimeMs,
    });

    const background = await loadBackground(request);
    const cursorImages = await loadCursorImages(request);
    compositionVisuals = await loadVisuals(request);
    baseFrames = await VideoFrameProvider.create(
      request.snapshot.video.src,
      Array.from({ length: total }, (_, frame) =>
        Math.min(request.snapshot.duration, frame / request.snapshot.video.fps) *
        (request.snapshot.composition.baseVideoPlaybackRate ?? 1),
      ),
    );
    if (!baseFrames) {
      fallbackVideo.load();
      await waitFor(fallbackVideo, "loadedmetadata");
    }
    await Promise.all(
      request.snapshot.composition.media
        .filter((asset) => asset.kind === "video")
        .map(async (asset) => {
          const timestamps = Array.from({ length: total }, (_, frame) => {
            const timeMs = (frame / request.snapshot.video.fps) * 1000;
            const layer = activeLayersAt(request.snapshot.composition, timeMs)
              .find((item): item is MediaCompositionLayer => item.kind === "video" && item.assetId === asset.id);
            return layer
              ? Math.max(0, ((timeMs - layer.startMs) * (layer.playbackRate ?? 1) + (layer.sourceOffsetMs ?? 0)) / 1000)
              : 0;
          });
          const provider = await VideoFrameProvider.create(asset.src, timestamps);
          if (provider) compositionFrames.set(asset.id, provider);
        }),
    );

    onProgress({
      stage: "audio_mixing",
      stageLabel: "Mixing audio tracks...",
      completed: 0,
      total,
      currentTimeMs: 0,
      totalTimeMs,
    });

    const mixedAudio = await renderMixedAudio(request);
    const audioSource =
      mixedAudio && audioCodec
        ? new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 })
        : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    if (audioSource && mixedAudio) await audioSource.add(mixedAudio);

    for (let frame = 0; frame < total; frame += 1) {
      if (signal.aborted)
        throw new DOMException("Export annulé.", "AbortError");
      const time = Math.min(
        request.snapshot.duration,
        frame / request.snapshot.video.fps,
      );
      const currentTimeMs = Math.round(time * 1000);

      onProgress({
        stage: "encoding",
        stageLabel: `Encoding frame ${frame + 1} of ${total}`,
        completed: frame + 1,
        total,
        currentTimeMs,
        totalTimeMs,
      });

      if (
        background instanceof HTMLVideoElement &&
        Math.abs(background.currentTime - time) > 0.001
      ) {
        background.currentTime = time % Math.max(0.001, background.duration);
        await waitFor(background, "seeked");
      }
      if (!baseFrames && Math.abs(fallbackVideo.currentTime - time) > 0.001) {
        fallbackVideo.currentTime = time * (request.snapshot.composition.baseVideoPlaybackRate ?? 1);
        await waitFor(fallbackVideo, "seeked");
      }
      const baseFrame = baseFrames ? await baseFrames.frameAt(frame) : null;
      const visualFrames = await Promise.all(
        [...compositionFrames].map(async ([assetId, provider]) => [assetId, await provider.frameAt(frame)] as const),
      );
      const decodedAssetIds = new Set(
        visualFrames
          .filter(([, visualFrame]) => Boolean(visualFrame))
          .map(([assetId]) => assetId),
      );
      const visuals = await visualsAtTime(request, compositionVisuals, time, decodedAssetIds);
      for (const [assetId, visualFrame] of visualFrames) if (visualFrame) visuals.set(assetId, visualFrame);
      try {
        renderCompositionFrame(
          context,
          baseFrame ?? fallbackVideo,
          request.snapshot,
          time,
          background,
          cursorImages,
          visuals,
        );
      } finally {
        baseFrame?.close();
        visualFrames.forEach(([, visualFrame]) => visualFrame?.close());
      }
      await source.add(time, 1 / request.snapshot.video.fps);
    }

    onProgress({
      stage: "finalizing",
      stageLabel: "Finalizing media file...",
      completed: total,
      total,
      currentTimeMs: totalTimeMs,
      totalTimeMs,
    });

    await output.finalize();
    const result = await window.capture!.finalizeExport(opened.jobId);
    return { path: result.path, format: request.format };
  } catch (error) {
    await output.cancel().catch(() => undefined);
    await window.capture!.abortExport(opened.jobId).catch(() => undefined);
    throw error;
  } finally {
    compositionVisuals?.dispose();
    baseFrames?.dispose();
    compositionFrames.forEach((provider) => provider.dispose());
    fallbackVideo.removeAttribute("src");
    fallbackVideo.load();
  }
}
