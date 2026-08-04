import { onUnmounted, watch } from 'vue';
import { activeClipsAt, sourceTimeAt } from '../../composition/engine/clip-engine';
import {
  getCaptionTransform,
  isVisualClip,
  type CaptionClip,
  type ClipComposition,
  type NormalizedTransform,
  type VisualClip,
} from '../../composition/composition-types';
import { drawWebcamOverlay, webcamSettingsForAppearance } from '../../composition/webcam/webcam-zoom';
import { drawDecoratedMedia } from '../../composition/appearance/render-decorated-media';
import type { OutputCanvasSettings } from '../output-canvas';

export interface UseCompositionMediaOptions {
  composition: () => ClipComposition;
  currentTime: () => number;
  isPlaying: () => boolean;
  selectedTransformClip: () => VisualClip | CaptionClip | null;
  transformDraft: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
  outputCanvas?: () => OutputCanvasSettings;
  onRenderOnce: () => void;
}

export function useCompositionMedia(options: UseCompositionMediaOptions) {
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  const pendingSeeks = new Map<HTMLVideoElement, number>();
  const seek = (media: HTMLVideoElement, targetTime: number) => {
    if (media.seeking) {
      pendingSeeks.set(media, targetTime);
      return;
    }
    if (Math.abs(media.currentTime - targetTime) > 0.005) media.currentTime = targetTime;
  };
  const disposeVideo = (media: HTMLVideoElement) => {
    pendingSeeks.delete(media);
    media.pause();
    media.removeAttribute('src');
    media.load();
  };
  const dispose = () => {
    videos.forEach(disposeVideo);
    images.clear();
    videos.clear();
    pendingSeeks.clear();
  };
  const reconcile = () => {
    const assets = new Map(options.composition().assets.map((asset) => [asset.id, asset]));
    for (const [id, media] of videos) {
      const asset = assets.get(id);
      if (asset?.kind === 'video' && asset.src === media.dataset.source) continue;
      disposeVideo(media);
      videos.delete(id);
    }
    for (const [id] of images) if (assets.get(id)?.kind !== 'image') images.delete(id);
    for (const asset of assets.values()) {
      if (!asset.src || asset.kind === 'audio') continue;
      if (asset.kind === 'image') {
        if (!images.has(asset.id)) {
          const image = new Image();
          image.src = asset.src;
          images.set(asset.id, image);
        }
        continue;
      }
      if (videos.has(asset.id)) continue;
      const media = document.createElement('video');
      media.muted = true;
      media.playsInline = true;
      media.preload = 'auto';
      media.dataset.source = asset.src;
      media.src = asset.src;
      const ready = () => {
        const pending = pendingSeeks.get(media);
        if (pending !== undefined) {
          pendingSeeks.delete(media);
          seek(media, pending);
        } else if (options.isPlaying() && media.paused) void media.play().catch(() => undefined);
        options.onRenderOnce();
      };
      media.addEventListener('seeked', ready);
      media.addEventListener('canplay', ready);
      media.addEventListener('loadeddata', ready);
      media.load();
      videos.set(asset.id, media);
    }
  };
  watch(
    () =>
      options
        .composition()
        .assets.map((asset) => `${asset.id}:${asset.kind}:${asset.src}`)
        .join('|'),
    reconcile,
    { immediate: true },
  );

  const syncVideos = () => {
    const composition = options.composition();
    const timeMs = options.currentTime() * 1_000;
    const active = activeClipsAt(composition, timeMs).filter(
      (clip): clip is VisualClip => isVisualClip(clip) && clip.kind !== 'screen',
    );
    const activeIds = new Set(active.map((clip) => clip.id));
    for (const clip of composition.clips) {
      if (!isVisualClip(clip) || clip.kind === 'image' || clip.kind === 'screen') continue;
      const media = videos.get(clip.assetId);
      if (!media) continue;
      if (!activeIds.has(clip.id)) {
        media.pause();
        continue;
      }
      const sourceMs = sourceTimeAt(clip, timeMs);
      if (sourceMs === null) {
        media.pause();
        continue;
      }
      const localTime = sourceMs / 1_000;
      media.playbackRate = clip.playbackRate;
      if (!options.isPlaying()) {
        media.pause();
        seek(media, localTime);
      } else {
        if (Math.abs(media.currentTime - localTime) > 1.5) seek(media, localTime);
        if (media.paused && !media.seeking) void media.play().catch(() => undefined);
      }
    }
  };
  watch(() => [options.currentTime(), options.isPlaying(), options.composition()] as const, syncVideos, {
    flush: 'post',
    deep: true,
  });

  const drawCaption = (
    ctx: CanvasRenderingContext2D,
    clip: CaptionClip,
    timeMs: number,
    window: { dx: number; dy: number; dw: number; dh: number },
    referenceWidth: number,
  ) => {
    const sentence = clip.caption.sentences.find((item) => item.startMs <= timeMs && timeMs <= item.endMs);
    const text = clip.caption.style.customText || sentence?.text;
    if (!text) return;
    const style = clip.caption.style;
    const selected = options.selectedTransformClip();
    const transform =
      clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : getCaptionTransform(clip);
    const centerX = window.dx + (transform.x + transform.width / 2) * window.dw;
    const centerY = window.dy + (transform.y + transform.height / 2) * window.dh;
    const boxWidth = transform.width * window.dw;
    const fontSize = Math.max(12, (style.fontSize * window.dw) / Math.max(1, referenceWidth));
    const strokeWidth = Math.max(1, ((style.boxPadding ?? 6) * window.dw) / Math.max(1, referenceWidth));
    ctx.save();
    ctx.font = `800 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (style.shadowBlur > 0) {
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = style.shadowBlur;
    }
    if ((style.boxColor ?? '#000000') !== 'transparent') {
      ctx.strokeStyle = style.boxColor ?? '#000000';
      ctx.lineWidth = strokeWidth * 2;
      ctx.strokeText(text, centerX, centerY, Math.max(10, boxWidth - 8));
    }
    ctx.fillStyle = style.color;
    ctx.fillText(text, centerX, centerY, Math.max(10, boxWidth - 8));
    ctx.restore();
  };

  const drawVisual = (
    ctx: CanvasRenderingContext2D,
    clip: VisualClip,
    window: { dx: number; dy: number; dw: number; dh: number },
  ) => {
    const source = clip.kind === 'image' ? images.get(clip.assetId) : videos.get(clip.assetId);
    if (!source) return;
    if (source instanceof HTMLVideoElement && source.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (source instanceof HTMLImageElement && (!source.complete || !source.naturalWidth)) return;
    const selected = options.selectedTransformClip();
    const transform = clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform;
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const crop = options.isCropping?.() && clip.id === selected?.id ? undefined : clip.crop;
    const output = options.outputCanvas?.();
    const shadowScale = output
      ? Math.min(window.dw / Math.max(1, output.width), window.dh / Math.max(1, output.height))
      : 1;
    drawDecoratedMedia(ctx, {
      source,
      sourceRect:
        crop && sourceWidth > 0 && sourceHeight > 0
          ? {
              x: crop.x * sourceWidth,
              y: crop.y * sourceHeight,
              width: crop.width * sourceWidth,
              height: crop.height * sourceHeight,
            }
          : undefined,
      rect: {
        x: window.dx + transform.x * window.dw,
        y: window.dy + transform.y * window.dh,
        width: transform.width * window.dw,
        height: transform.height * window.dh,
      },
      appearance: clip.appearance,
      shadowScale,
      title: clip.name,
      mirrored: clip.isMirrored,
      mirroredY: clip.isMirroredY,
    });
  };

  const drawComposition = (
    ctx: CanvasRenderingContext2D,
    window: { dx: number; dy: number; dw: number; dh: number },
    referenceWidth: number,
    onlyClipId?: string,
  ) => {
    const timeMs = options.currentTime() * 1_000;
    const clips = activeClipsAt(options.composition(), timeMs)
      .filter((clip) => clip.kind !== 'screen' && clip.kind !== 'webcam')
      .filter((clip) => (onlyClipId ? clip.id === onlyClipId : clip.kind === 'caption'))
      .sort((left, right) => right.order - left.order);
    for (const clip of clips) {
      if (clip.kind === 'caption') drawCaption(ctx, clip, timeMs, window, referenceWidth);
      else if (isVisualClip(clip)) drawVisual(ctx, clip, window);
    }
  };

  const drawWebcamClips = (
    ctx: CanvasRenderingContext2D,
    window: { dx: number; dy: number; dw: number; dh: number; scale: number },
    onlyClipId?: string,
  ) => {
    const selected = options.selectedTransformClip();
    for (const clip of activeClipsAt(options.composition(), options.currentTime() * 1_000)) {
      if (clip.kind !== 'webcam' || (onlyClipId && clip.id !== onlyClipId)) continue;
      const source = videos.get(clip.assetId);
      if (!source || source.readyState < HTMLMediaElement.HAVE_METADATA) continue;
      ctx.save();
      ctx.translate(window.dx, window.dy);
      drawWebcamOverlay(
        ctx,
        source,
        window.dw,
        window.dh,
        window.scale,
        webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
        clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform,
        options.isCropping?.() && clip.id === selected?.id ? undefined : clip.crop,
        clip.appearance,
        clip.name,
        options.outputCanvas
          ? Math.min(
              window.dw / Math.max(1, options.outputCanvas().width),
              window.dh / Math.max(1, options.outputCanvas().height),
            )
          : 1,
      );
      ctx.restore();
    }
  };

  onUnmounted(dispose);
  return { images, videos, drawComposition, drawWebcamClips };
}
