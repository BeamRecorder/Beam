import { watch, onUnmounted } from "vue";
import {
  activeLayersAt,
  type ClipAppearance,
  type MediaCompositionLayer,
  type NormalizedTransform,
  type ProjectComposition,
} from "../../composition/composition-types";
import {
  drawWebcamOverlay,
  webcamSettingsForAppearance,
} from "../../composition/webcam/webcam-zoom";

export interface UseCompositionMediaOptions {
  composition: () => ProjectComposition;
  currentTime: () => number;
  isPlaying: () => boolean;
  selectedTransformLayer: () => MediaCompositionLayer | null;
  webcamDraft: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
}

const DEFAULT_CLIP_APPEARANCE: ClipAppearance = {
  cornerRadius: "sm",
  shadowSize: "md",
  shadowColor: "#000000",
  shadowDirection: "bottom",
};

export const radiusForAppearance = (appearance: ClipAppearance | undefined) =>
  ({ none: 0, sm: 8, md: 16, lg: 24, full: Number.MAX_SAFE_INTEGER })[
    (appearance ?? DEFAULT_CLIP_APPEARANCE).cornerRadius
  ];

export const applyClipShadow = (
  ctx: CanvasRenderingContext2D,
  appearance: ClipAppearance | undefined,
  width: number,
) => {
  const style = appearance ?? DEFAULT_CLIP_APPEARANCE;
  const blur = { none: 0, sm: 10, md: 20, lg: 32 }[style.shadowSize];
  const direction = style.shadowDirection;
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX =
    direction === "top-left"
      ? -width * 0.018
      : direction === "bottom-right"
        ? width * 0.018
        : 0;
  ctx.shadowOffsetY =
    direction === "top-left"
      ? -width * 0.018
      : direction === "all"
        ? 0
        : width * 0.018;
};

export function useCompositionMedia(options: UseCompositionMediaOptions) {
  const compositionImages = new Map<string, HTMLImageElement>();
  const compositionVideos = new Map<string, HTMLVideoElement>();

  const disposeCompositionMedia = () => {
    compositionVideos.forEach((media) => {
      media.pause();
      media.removeAttribute("src");
      media.load();
    });
    compositionImages.clear();
    compositionVideos.clear();
  };

  const reconcileCompositionMedia = () => {
    const comp = options.composition();
    const mediaById = new Map(comp.media.map((asset) => [asset.id, asset]));

    for (const [id, media] of compositionVideos) {
      const asset = mediaById.get(id);
      if (asset?.kind === "video" && asset.src === media.dataset.source)
        continue;
      media.pause();
      media.removeAttribute("src");
      media.load();
      compositionVideos.delete(id);
    }

    for (const [id] of compositionImages) {
      const asset = mediaById.get(id);
      if (asset?.kind === "image") continue;
      compositionImages.delete(id);
    }

    for (const asset of comp.media) {
      if (asset.kind === "audio" || !asset.src) continue;
      if (asset.kind === "image") {
        if (!compositionImages.has(asset.id)) {
          const image = new Image();
          image.src = asset.src;
          compositionImages.set(asset.id, image);
        }
        continue;
      }
      if (!compositionVideos.has(asset.id)) {
        const media = document.createElement("video");
        media.muted = true;
        media.playsInline = true;
        media.preload = "auto";
        media.dataset.source = asset.src;
        media.src = asset.src;
        media.load();
        compositionVideos.set(asset.id, media);
      }
    }
  };

  watch(
    () =>
      options
        .composition()
        .media.map((asset) => `${asset.id}:${asset.kind}:${asset.src}`)
        .join("|"),
    reconcileCompositionMedia,
    { immediate: true },
  );

  const syncCompositionVideos = () => {
    const comp = options.composition();
    const currentTime = options.currentTime();
    const isPlaying = options.isPlaying();
    const timeMs = currentTime * 1000;

    const active = new Set(
      activeLayersAt(comp, timeMs)
        .filter((layer) => layer.kind === "video")
        .map((layer) => layer.id),
    );

    for (const layer of comp.layers) {
      if (layer.kind !== "video") continue;
      const media = compositionVideos.get(layer.assetId);
      if (!media) continue;
      if (!active.has(layer.id)) {
        media.pause();
        continue;
      }
      const localTime =
        currentTime - layer.startMs / 1000 + (layer.sourceOffsetMs ?? 0) / 1000;
      if (
        localTime < 0 ||
        (Number.isFinite(media.duration) && localTime >= media.duration)
      )
        continue;
      const drift = Math.abs(media.currentTime - localTime);
      if (!isPlaying) {
        media.pause();
        if (drift > 0.01) media.currentTime = localTime;
        continue;
      }
      if (drift > 0.04) media.currentTime = localTime;
      if (media.paused) void media.play().catch(() => undefined);
    }
  };

  watch(
    () =>
      [
        options.currentTime(),
        options.isPlaying(),
        options.composition(),
      ] as const,
    syncCompositionVideos,
    { flush: "post" },
  );

  const drawComposition = (
    ctx: CanvasRenderingContext2D,
    videoWindow: { dx: number; dy: number; dw: number; dh: number },
    mainVideoWidth: number,
    followsZoom: boolean,
  ) => {
    const comp = options.composition();
    const currentTime = options.currentTime();
    const timeMs = currentTime * 1000;
    const selectedTransformLayer = options.selectedTransformLayer();
    const webcamDraft = options.webcamDraft();

    for (const layer of activeLayersAt(comp, timeMs)) {
      if (
        layer.kind === "audio" ||
        (layer.kind === "video" && layer.reactToZoom) ||
        (followsZoom ? layer.kind === "video" : layer.kind !== "video")
      )
        continue;

      if (layer.kind === "caption") {
        const sentence = layer.caption.sentences.find(
          (item) => item.startMs <= timeMs && timeMs <= item.endMs,
        );
        if (!sentence?.text) continue;
        const style = layer.caption.style;
        ctx.save();
        ctx.font = `${Math.max(
          12,
          (style.fontSize * videoWindow.dw) /
            Math.max(1, mainVideoWidth || 1920),
        )}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = style.color;
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = style.shadowBlur;
        const y =
          style.placement === "top"
            ? 0.12
            : style.placement === "center"
              ? 0.5
              : 0.88;
        ctx.fillText(
          sentence.text,
          videoWindow.dx + videoWindow.dw / 2,
          videoWindow.dy + videoWindow.dh * y,
          videoWindow.dw * 0.9,
        );
        ctx.restore();
        continue;
      }

      const asset =
        layer.kind === "image"
          ? compositionImages.get(layer.assetId)
          : compositionVideos.get(layer.assetId);
      if (!asset) continue;

      const transform =
        layer.id === selectedTransformLayer?.id && webcamDraft
          ? webcamDraft
          : (layer.transform ?? { x: 0, y: 0, width: 1, height: 1 });

      if (
        asset instanceof HTMLVideoElement &&
        asset.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      )
        continue;
      if (
        asset instanceof HTMLImageElement &&
        (!asset.complete || !asset.naturalWidth)
      )
        continue;

      const dx = videoWindow.dx + transform.x * videoWindow.dw;
      const dy = videoWindow.dy + transform.y * videoWindow.dh;
      const dw = transform.width * videoWindow.dw;
      const dh = transform.height * videoWindow.dh;
      const appearance = layer.appearance;

      ctx.save();
      applyClipShadow(ctx, appearance, dw);
      ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
      ctx.beginPath();
      ctx.roundRect(
        dx,
        dy,
        dw,
        dh,
        Math.min(radiusForAppearance(appearance), dw / 2, dh / 2),
      );
      ctx.fill();
      ctx.clip();

      const sourceWidth =
        asset instanceof HTMLVideoElement
          ? asset.videoWidth
          : asset.naturalWidth;
      const sourceHeight =
        asset instanceof HTMLVideoElement
          ? asset.videoHeight
          : asset.naturalHeight;

      const isThisLayerCropping =
        options.isCropping?.() && layer.id === selectedTransformLayer?.id;
      const crop = isThisLayerCropping ? undefined : layer.crop;

      if (layer.isMirrored) {
        ctx.translate(dx * 2 + dw, 0);
        ctx.scale(-1, 1);
      }

      if (crop && sourceWidth > 0 && sourceHeight > 0) {
        ctx.drawImage(
          asset,
          crop.x * sourceWidth,
          crop.y * sourceHeight,
          crop.width * sourceWidth,
          crop.height * sourceHeight,
          dx,
          dy,
          dw,
          dh,
        );
      } else {
        ctx.drawImage(asset, dx, dy, dw, dh);
      }
      ctx.restore();
    }
  };

  const drawWebcamLayers = (
    ctx: CanvasRenderingContext2D,
    videoWindow: {
      dx: number;
      dy: number;
      dw: number;
      dh: number;
      scale: number;
    },
  ) => {
    const comp = options.composition();
    const currentTime = options.currentTime();
    const timeMs = currentTime * 1000;
    const selectedTransformLayer = options.selectedTransformLayer();
    const webcamDraft = options.webcamDraft();

    for (const layer of activeLayersAt(comp, timeMs)) {
      if (layer.kind !== "video" || !layer.reactToZoom) continue;
      const asset = compositionVideos.get(layer.assetId);
      const localTime =
        currentTime - layer.startMs / 1000 + (layer.sourceOffsetMs ?? 0) / 1000;

      if (
        !asset ||
        localTime < 0 ||
        (Number.isFinite(asset.duration) && localTime >= asset.duration) ||
        asset.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      )
        continue;

      ctx.save();
      ctx.translate(videoWindow.dx, videoWindow.dy);
      const isThisLayerCropping =
        options.isCropping?.() && layer.id === selectedTransformLayer?.id;
      drawWebcamOverlay(
        ctx,
        asset,
        videoWindow.dw,
        videoWindow.dh,
        videoWindow.scale,
        webcamSettingsForAppearance(
          layer.appearance ?? layer.webcamAppearance,
          layer.isMirrored,
        ),
        layer.id === selectedTransformLayer?.id && webcamDraft
          ? webcamDraft
          : layer.transform,
        isThisLayerCropping ? undefined : layer.crop,
      );
      ctx.restore();
    }
  };

  onUnmounted(disposeCompositionMedia);

  return {
    compositionImages,
    compositionVideos,
    drawComposition,
    drawWebcamLayers,
  };
}
