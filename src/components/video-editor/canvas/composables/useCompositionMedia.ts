import { onUnmounted, watch } from 'vue';
import { activeClipsAt, type MediaFrame } from '~/media/shared';
import {
  isVisualClip,
  type CaptionClip,
  type ClipComposition,
  type NormalizedTransform,
  type VisualClip,
} from '~/media/shared/composition-types';
import { captionContentAt } from '~/media/shared/caption-text-layout';
import { drawWebcamOverlay, webcamSettingsForAppearance } from '../../composition/webcam/webcam-zoom';
import { drawDecoratedMedia } from '../../composition/appearance/render-decorated-media';
import { drawCaptionText, type CaptionViewport } from '../../composition/captions/render-caption-text';
import type { OutputCanvasSettings } from '../output-canvas';

export interface UseCompositionMediaOptions {
  composition: () => ClipComposition;
  currentTime: () => number;
  frameFor: (clipId: string) => MediaFrame | null;
  selectedTransformClip: () => VisualClip | CaptionClip | null;
  transformDraft: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
  outputCanvas: () => OutputCanvasSettings;
  captionViewport: () => CaptionViewport;
  keyboardCursorPosition?: () => { x: number; y: number } | null;
  onRenderOnce: () => void;
}

export function useCompositionMedia(options: UseCompositionMediaOptions) {
  const images = new Map<string, HTMLImageElement>();
  const dispose = () => {
    images.clear();
  };
  const reconcile = () => {
    const assets = new Map(options.composition().assets.map((asset) => [asset.id, asset]));
    for (const [id] of images) if (assets.get(id)?.kind !== 'image') images.delete(id);
    for (const asset of assets.values()) {
      if (asset.kind === 'image' && asset.src && !images.has(asset.id)) {
        const image = new Image();
        image.src = asset.src;
        images.set(asset.id, image);
      }
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

  const drawCaption = (ctx: CanvasRenderingContext2D, clip: CaptionClip, timeMs: number) => {
    const { text, runs } = captionContentAt(clip, timeMs);
    if (!text) return;
    const selected = options.selectedTransformClip();
    const transformDraft = clip.id === selected?.id ? options.transformDraft() : null;
    const renderClip = transformDraft ? { ...clip, transform: transformDraft } : clip;
    drawCaptionText(ctx, {
      clip: renderClip,
      text,
      runs,
      cursorPosition:
        clip.caption.type === 'keyboard' && clip.caption.followCursor ? options.keyboardCursorPosition?.() : null,
      canvas: options.outputCanvas(),
      viewport: options.captionViewport(),
    });
  };

  const drawVisual = (
    ctx: CanvasRenderingContext2D,
    clip: VisualClip,
    window: { dx: number; dy: number; dw: number; dh: number },
  ) => {
    const frame = clip.kind === 'image' ? null : options.frameFor(clip.id);
    const image = clip.kind === 'image' ? images.get(clip.assetId) : null;
    if (image && (!image.complete || !image.naturalWidth)) return;
    const source = frame?.bitmap ?? image;
    if (!source) return;
    const selected = options.selectedTransformClip();
    const transform = clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform;
    const sourceWidth = frame?.width ?? image?.naturalWidth ?? 0;
    const sourceHeight = frame?.height ?? image?.naturalHeight ?? 0;
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
    onlyClipId?: string,
  ) => {
    const timeMs = options.currentTime() * 1_000;
    const clips = activeClipsAt(options.composition(), timeMs)
      .filter((clip) => clip.kind !== 'screen' && clip.kind !== 'webcam')
      .filter((clip) => (onlyClipId ? clip.id === onlyClipId : clip.kind === 'caption'))
      .sort((left, right) => right.order - left.order);
    for (const clip of clips) {
      if (clip.kind === 'caption') drawCaption(ctx, clip, timeMs);
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
      const frame = options.frameFor(clip.id);
      if (!frame) continue;
      ctx.save();
      ctx.translate(window.dx, window.dy);
      drawWebcamOverlay(
        ctx,
        frame.bitmap,
        { width: frame.width, height: frame.height },
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
  return { images, drawComposition, drawWebcamClips };
}
