import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { compositionDurationMs } from '@beam/engine/shared/timeline-mapping';
import { cursorAssetAt } from '@beam/runtime/cursor/cursor-rendering';
import { cursorStateAt } from '@beam/engine/cursor/cursorPlayback';
import { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import { sessionTimeAt } from '@beam/engine/shared/timeline-mapping';
import { createSnapshotCameraEvaluator } from '@beam/runtime/rendering/snapshot-camera';
import { renderCompositionFrame, disposeCompositionRenderer } from '@beam/runtime/rendering/render';
import { WATERMARK_LOGO_KEY } from '@beam/runtime/rendering/watermark-render';
import type { CompositionSceneLayers } from '@beam/engine/composition/scene-layers';
import type { CompositionVisuals, RenderableMedia } from '@beam/runtime/rendering/render-types';
import type { RuntimePreviewOptions } from './runtime-preview-types';
import type { MediaFrame } from '@beam/runtime/shared/index';
import { selectedZoomPreviewTilt } from './composables/camera-preview-tilt';
import { isVisualClip } from '@beam/engine/shared/composition-types';
import { isPhoneFrame } from '@beam/engine/shared/phone-frame-types';

/** The desktop supplies decoded resources and editing drafts to the same completed-frame renderer as export. */
export function createRuntimePreview(options: RuntimePreviewOptions) {
  const absentCursor: CompositionSnapshot['cursor'] = {
    available: false,
    events: [],
    telemetry: [],
    shapes: {},
    catalog: {},
    missing: [],
  };
  let background: OffscreenCanvas | null = null;
  let cameraKey: readonly unknown[] = [];
  let camera: ReturnType<typeof createSnapshotCameraEvaluator> | null = null;
  let motionKey: readonly unknown[] = [];
  let motion: ReturnType<typeof createCursorMotionPlayer> | undefined;
  return {
    draw(
      ctx: CanvasRenderingContext2D,
      bounds: { x: number; y: number; width: number; height: number },
      frame: MediaFrame | null,
      layers: CompositionSceneLayers,
    ) {
      const props = options.props;
      const size = {
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height)),
      };
      const drafts = options.drafts();
      const editingId = options.editingCaptionId();
      const cropped = props.isCropping ? props.selectedTransformClip : null;
      const draft = <T extends { id: string }>(clip: T): T => {
        const transform = Object.hasOwn(drafts, clip.id) ? drafts[clip.id] : undefined;
        if (clip.id === editingId) return { ...clip, enabled: false };
        if (cropped && clip.id === cropped.id && isVisualClip(cropped))
          return {
            ...clip,
            crop: { x: 0, y: 0, width: 1, height: 1 },
            cameraFramingPreset: isPhoneFrame(cropped.appearance.frame) ? 'fit' : 'custom',
            ...(transform ? { transform } : {}),
          };
        return transform ? { ...clip, transform } : clip;
      };
      const evaluated =
        !editingId && !cropped && Object.keys(drafts).length === 0
          ? layers
          : {
              ...layers,
              screen: layers.screen ? draft(layers.screen) : null,
              visualStack: layers.visualStack.map(draft),
              captions: layers.captions.filter((clip) => clip.id !== editingId).map(draft),
            };
      const cursor = props.editorData?.cursor ?? absentCursor;
      const snapshot: CompositionSnapshot = {
        duration: props.duration ?? compositionDurationMs(props.composition) / 1000,
        render: {
          fps: 60,
          sourceWidth: frame?.width ?? null,
          sourceHeight: frame?.height ?? null,
        },
        referenceCanvas: props.outputCanvas,
        canvas: { ...props.outputCanvas, ...size },
        background: null,
        blurPercent: 0,
        zooms:
          !props.isPlaying && props.selectedZoom?.mode === 'manual'
            ? props.zoomElements.filter((zoom) => zoom.id !== props.selectedZoom!.id)
            : props.zoomElements,
        zoomMotionBlur: props.zoomMotionBlur,
        zoomAutoFollow: props.zoomAutoFollow,
        cursor,
        cursorPack: props.cursorPack,
        cursorSettings: {
          enabled: options.cursorEnabled(),
          selection: props.cursorSelection,
          size: (props.cursorSize * size.width) / props.outputCanvas.width,
          color: props.cursorColor,
          shadow: {
            enabled: props.enableShadow,
            blur: (props.shadowBlur * size.width) / props.outputCanvas.width,
            color: props.shadowColor,
            direction: props.shadowDirection,
          },
          clickEffects: props.clickEffects,
          motion: props.motion,
          autoHide: props.autoHide,
        },
        composition: props.composition,
      };
      const key = [
        props.composition,
        props.zoomElements,
        props.selectedZoom,
        props.isPlaying,
        props.zoomAutoFollow,
        cursor.telemetry,
        frame?.width,
        frame?.height,
        size.width,
        size.height,
        props.outputCanvas,
      ];
      if (!camera || key.some((value, index) => value !== cameraKey[index])) {
        cameraKey = key;
        camera = createSnapshotCameraEvaluator(snapshot, frame?.width ?? size.width, frame?.height ?? size.height);
      }
      const cursorKey = [
        cursor.events,
        props.motion.preset,
        props.motion.smoothing,
        props.motion.springMassMultiplier,
        props.motion.motionBlur,
        props.motion.stopSpringEnabled,
        props.motion.stopSpringStrength,
        frame?.width,
        frame?.height,
      ];
      if (!motion || cursorKey.some((value, index) => value !== motionKey[index])) {
        motionKey = cursorKey;
        motion = createCursorMotionPlayer(
          cursor.events,
          props.motion,
          frame?.width ?? size.width,
          frame?.height ?? size.height,
        );
      }
      const visuals = new Map<string, RenderableMedia>();
      for (const clip of evaluated.visualStack) {
        if (!isVisualClip(clip)) continue;
        const media = props.frameFor(clip.id);
        const image = options.images.get(clip.assetId);
        if (media)
          visuals.set(clip.id, {
            source: media.bitmap,
            width: media.width,
            height: media.height,
          });
        else if (image?.complete && image.naturalWidth > 0)
          visuals.set(clip.id, {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
      }
      const watermark = options.watermarkImage();
      if (watermark?.complete)
        visuals.set(WATERMARK_LOGO_KEY, {
          source: watermark,
          width: watermark.naturalWidth,
          height: watermark.naturalHeight,
        });
      const cursorImages = new Map<string, HTMLImageElement>();
      const cursorTime = evaluated.screen
        ? (sessionTimeAt(evaluated.screen, props.currentTime * 1000, props.composition) ?? 0) / 1000
        : props.currentTime;
      const asset = props.cursorPack
        ? cursorAssetAt(props.cursorPack, props.cursorSelection, cursorStateAt(cursor.events, cursorTime))
        : null;
      const image = options.cursorImage();
      if (asset && image) cursorImages.set(asset.id, image);
      background ??= new OffscreenCanvas(size.width, size.height);
      if (background.width !== size.width) background.width = size.width;
      if (background.height !== size.height) background.height = size.height;
      const backgroundCtx = background.getContext('2d');
      if (!backgroundCtx) throw new Error('Preview background canvas unavailable.');
      backgroundCtx.clearRect(0, 0, size.width, size.height);
      options.drawBackground(backgroundCtx, { x: 0, y: 0, ...size });
      const tilt = selectedZoomPreviewTilt(props.selectedZoom, props.isPlaying);
      const evaluator = tilt
        ? {
            sample: (timeMs: number) => ({
              ...camera!.sample(timeMs),
              ...tilt,
            }),
            invalidate: () => camera!.invalidate(),
          }
        : camera;
      ctx.save();
      ctx.translate(bounds.x, bounds.y);
      ctx.scale(bounds.width / size.width, bounds.height / size.height);
      try {
        renderCompositionFrame(
          ctx,
          frame ? { source: frame.bitmap, width: frame.width, height: frame.height } : null,
          snapshot,
          props.currentTime,
          { source: background, ...size, preRendered: true },
          cursorImages,
          visuals as CompositionVisuals,
          motion,
          evaluator,
          evaluated,
        );
      } finally {
        ctx.restore();
      }
    },
    dispose() {
      disposeCompositionRenderer();
      if (background) background.width = background.height = 0;
      background = null;
    },
  };
}
