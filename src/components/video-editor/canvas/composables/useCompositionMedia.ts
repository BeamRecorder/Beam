import { onUnmounted, watch } from 'vue';
import { activeClipsAt, type MediaFrame } from '~/media/shared';
import {
  isBlurClip,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type BlurClip,
  type CaptionClip,
  type ClipComposition,
  type ColorClip,
  type NormalizedTransform,
  type ShapeClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { captionContentAt } from '~/media/shared/caption-text-layout';
import {
  drawWebcamOverlay,
  webcamReactsToZoom,
  webcamSettingsForAppearance,
} from '../../composition/webcam/webcam-zoom';
import { drawDecoratedMedia } from '../../composition/appearance/render-decorated-media';
import { isPhoneFrame } from '../../composition/appearance/phone-frames';
import { drawFrameOverlay, frameOuterRect } from '../../composition/appearance/frames';
import { drawCaptionText, type CaptionViewport } from '../../composition/captions/render-caption-text';
import type { OutputCanvasSettings } from '../output-canvas';
import { applyBlurEffect } from '../../composition/effects/blur-effect';
import { resolveCompositionSceneLayers, type CompositionSceneLayers } from '../../composition/scene-layers';
import { drawWithClipTransition } from '../../composition/transitions/render-transition';
import { resolveVisualClipFraming } from '../../composition/visual-framing';
import { drawColorClip } from '../../composition/color/render-color-clip';
import { drawShapeClip } from '../../composition/shape/render-shape-clip';

export interface UseCompositionMediaOptions {
  composition: () => ClipComposition;
  currentTime: () => number;
  frameFor: (clipId: string) => MediaFrame | null;
  selectedTransformClip: () => VisualClip | ColorClip | ShapeClip | BlurClip | CaptionClip | null;
  transformDraft: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
  outputCanvas: () => OutputCanvasSettings;
  captionViewport: () => CaptionViewport;
  keyboardCursorPosition?: () => { x: number; y: number } | null;
  editingCaptionId?: () => string | null;
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
    const { text, runs, wordHighlight } = captionContentAt(clip, timeMs);
    if (!text) return;
    const selected = options.selectedTransformClip();
    const transformDraft = clip.id === selected?.id ? options.transformDraft() : null;
    const renderClip = transformDraft ? { ...clip, transform: transformDraft } : clip;
    drawCaptionText(ctx, {
      clip: renderClip,
      text,
      runs,
      wordHighlight,
      cursorPosition:
        clip.caption.type === 'keyboard' && clip.caption.followCursor ? options.keyboardCursorPosition?.() : null,
      hideText: options.editingCaptionId?.() === clip.id,
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
    const editingCrop = Boolean(options.isCropping?.() && clip.id === selected?.id);
    const editingPhoneCrop = editingCrop && isPhoneFrame(clip.appearance.frame);
    const crop = editingCrop ? { x: 0, y: 0, width: 1, height: 1 } : clip.crop;
    const layout = {
      x: window.dx + transform.x * window.dw,
      y: window.dy + transform.y * window.dh,
      width: transform.width * window.dw,
      height: transform.height * window.dh,
    };
    const framing = resolveVisualClipFraming(
      clip,
      layout,
      sourceWidth,
      sourceHeight,
      crop,
      editingPhoneCrop ? 'fit' : editingCrop ? 'custom' : (clip.cameraFramingPreset ?? 'custom'),
    );
    const output = options.outputCanvas?.();
    const shadowScale = output
      ? Math.min(window.dw / Math.max(1, output.width), window.dh / Math.max(1, output.height))
      : 1;
    drawDecoratedMedia(ctx, {
      source,
      sourceRect: framing.sourceRect,
      rect: framing.rect,
      appearance: editingPhoneCrop ? { ...clip.appearance, frame: 'none' } : clip.appearance,
      shadowScale,
      title: clip.name,
      mirrored: clip.isMirrored,
      mirroredY: clip.isMirroredY,
      mask: framing.mask,
      shadowFollowsSourceAlpha: clip.kind === 'image',
    });
    if (editingPhoneCrop)
      drawFrameOverlay(
        ctx,
        frameOuterRect(layout, clip.appearance.frame),
        clip.appearance.frame,
        clip.name,
        clip.appearance.frameColor,
        {
          showMenu: clip.appearance.frameShowMenu,
          showScrollbars: clip.appearance.frameShowScrollbars,
          chromeScale: clip.appearance.frameChromeScale,
        },
      );
  };

  const drawBlur = (
    ctx: CanvasRenderingContext2D,
    clip: BlurClip,
    window: { dx: number; dy: number; dw: number; dh: number },
  ) => {
    const selected = options.selectedTransformClip();
    const transform = clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform;
    applyBlurEffect(ctx, clip, {
      x: window.dx + transform.x * window.dw,
      y: window.dy + transform.y * window.dh,
      width: transform.width * window.dw,
      height: transform.height * window.dh,
    });
  };

  const drawColor = (
    ctx: CanvasRenderingContext2D,
    clip: ColorClip,
    window: { dx: number; dy: number; dw: number; dh: number },
  ) => {
    const selected = options.selectedTransformClip();
    const transform = clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform;
    drawColorClip(ctx, clip, { x: window.dx, y: window.dy, width: window.dw, height: window.dh }, transform);
  };

  const drawShape = (
    ctx: CanvasRenderingContext2D,
    clip: ShapeClip,
    window: { dx: number; dy: number; dw: number; dh: number },
  ) => {
    const selected = options.selectedTransformClip();
    const transform = clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform;
    drawShapeClip(ctx, clip, { x: window.dx, y: window.dy, width: window.dw, height: window.dh }, transform);
  };

  const drawWebcam = (
    ctx: CanvasRenderingContext2D,
    clip: VisualClip,
    window: {
      dx: number;
      dy: number;
      dw: number;
      dh: number;
      scale: number;
      focusX?: number;
      focusY?: number;
    },
  ) => {
    const frame = options.frameFor(clip.id);
    if (!frame) return;
    const selected = options.selectedTransformClip();
    const scale = window.scale || 1;
    const centerX = window.dx + window.dw / 2;
    const centerY = window.dy + window.dh / 2;
    ctx.save();
    // The scene stack is rendered in camera space. Cancel that projection for
    // webcam overlays so zoom keeps their existing screen-anchored behavior,
    // while their position in the stack can still be blurred by higher layers.
    ctx.translate(window.focusX ?? centerX, window.focusY ?? centerY);
    ctx.scale(1 / scale, 1 / scale);
    ctx.translate(-centerX, -centerY);
    ctx.translate(window.dx, window.dy);
    drawWebcamOverlay(
      ctx,
      frame.bitmap,
      { width: frame.width, height: frame.height },
      window.dw,
      window.dh,
      scale,
      {
        ...webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
        reactToZoom: webcamReactsToZoom(clip),
      },
      clip.id === selected?.id && options.transformDraft() ? options.transformDraft()! : clip.transform,
      options.isCropping?.() && clip.id === selected?.id ? undefined : clip.crop,
      clip.appearance,
      clip.name,
      undefined,
      options.isCropping?.() && clip.id === selected?.id ? 'custom' : (clip.cameraFramingPreset ?? 'custom'),
    );
    ctx.restore();
  };

  const drawVisualStack = (
    ctx: CanvasRenderingContext2D,
    window: { dx: number; dy: number; dw: number; dh: number; scale: number; focusX?: number; focusY?: number },
    drawScreen: () => void,
    resolvedLayers?: CompositionSceneLayers,
  ) => {
    const layers =
      resolvedLayers ?? resolveCompositionSceneLayers(options.composition(), options.currentTime() * 1_000);
    const timeMs = options.currentTime() * 1_000;
    for (const clip of layers.visualStack) {
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        { x: window.dx, y: window.dy, width: window.dw, height: window.dh },
        () => {
          if (clip.kind === 'screen') drawScreen();
          else if (clip.kind === 'color') drawColor(ctx, clip, window);
          else if (clip.kind === 'shape') drawShape(ctx, clip, window);
          else if (clip.kind === 'blur') drawBlur(ctx, clip, window);
          else if (clip.kind === 'webcam') drawWebcam(ctx, clip, window);
          else drawVisual(ctx, clip, window);
        },
      );
    }
  };

  const drawComposition = (
    ctx: CanvasRenderingContext2D,
    window: { dx: number; dy: number; dw: number; dh: number },
    onlyClipId?: string,
    resolvedLayers?: CompositionSceneLayers,
  ) => {
    const timeMs = options.currentTime() * 1_000;
    const clips = (resolvedLayers?.captions ?? activeClipsAt(options.composition(), timeMs))
      .filter((clip) => (onlyClipId ? clip.id === onlyClipId : clip.kind === 'caption'))
      .sort((left, right) => right.order - left.order);
    for (const clip of clips) {
      drawWithClipTransition(
        ctx,
        clip,
        timeMs,
        { x: window.dx, y: window.dy, width: window.dw, height: window.dh },
        () => {
          if (clip.kind === 'caption') drawCaption(ctx, clip, timeMs);
          else if (isColorClip(clip)) drawColor(ctx, clip, window);
          else if (isShapeClip(clip)) drawShape(ctx, clip, window);
          else if (isBlurClip(clip)) drawBlur(ctx, clip, window);
          else if (isVisualClip(clip) && clip.kind !== 'webcam') drawVisual(ctx, clip, window);
        },
      );
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
        {
          ...webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
          reactToZoom: webcamReactsToZoom(clip),
        },
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
        options.isCropping?.() && clip.id === selected?.id ? 'custom' : (clip.cameraFramingPreset ?? 'custom'),
      );
      ctx.restore();
    }
  };

  onUnmounted(dispose);
  return { images, drawComposition, drawWebcamClips, drawVisualStack };
}
