import { watch, onUnmounted } from "vue";
import {
  activeLayersAt,
  getCaptionTransform,
  type CompositionLayer,
  type NormalizedTransform,
  type ProjectComposition,
} from "../../composition/composition-types";
import {
  drawWebcamOverlay,
  webcamSettingsForAppearance,
} from "../../composition/webcam/webcam-zoom";
import { drawDecoratedMedia } from "../../composition/appearance/render-decorated-media";

export interface UseCompositionMediaOptions {
  composition: () => ProjectComposition;
  currentTime: () => number;
  isPlaying: () => boolean;
  selectedTransformLayer: () => CompositionLayer | null;
  webcamDraft: () => NormalizedTransform | null;
  isCropping?: () => boolean | undefined;
  onRenderOnce: () => void;
}

export function useCompositionMedia(options: UseCompositionMediaOptions) {
  const compositionImages = new Map<string, HTMLImageElement>();
  const compositionVideos = new Map<string, HTMLVideoElement>();
  const videoListeners = new Map<HTMLVideoElement, () => void>();
  const pendingSeekTimes = new Map<HTMLVideoElement, number>();

  const performMediaSeek = (media: HTMLVideoElement, targetTime: number) => {
    if (media.seeking) {
      pendingSeekTimes.set(media, targetTime);
      return;
    }
    if (Math.abs(media.currentTime - targetTime) <= 0.005) return;

    // Do NOT use fastSeek! fastSeek seeks to nearest keyframe (I-frame),
    // causing imprecise seeking and jumping to wrong frames.
    media.currentTime = targetTime;
  };

  const disposeCompositionMedia = () => {
    compositionVideos.forEach((media) => {
      pendingSeekTimes.delete(media);
      const listener = videoListeners.get(media);
      if (listener) {
        media.removeEventListener("seeked", listener);
        media.removeEventListener("canplay", listener);
        media.removeEventListener("loadeddata", listener);
        videoListeners.delete(media);
      }
      media.pause();
      media.removeAttribute("src");
      media.load();
    });
    compositionImages.clear();
    compositionVideos.clear();
    pendingSeekTimes.clear();
  };

  const reconcileCompositionMedia = () => {
    const comp = options.composition();
    const mediaById = new Map(comp.media.map((asset) => [asset.id, asset]));

    for (const [id, media] of compositionVideos) {
      const asset = mediaById.get(id);
      if (asset?.kind === "video" && asset.src === media.dataset.source)
        continue;
      pendingSeekTimes.delete(media);
      const listener = videoListeners.get(media);
      if (listener) {
        media.removeEventListener("seeked", listener);
        media.removeEventListener("canplay", listener);
        media.removeEventListener("loadeddata", listener);
        videoListeners.delete(media);
      }
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

        const handleFrameReady = () => {
          const pending = pendingSeekTimes.get(media);
          if (pending !== undefined) {
            pendingSeekTimes.delete(media);
            performMediaSeek(media, pending);
          } else if (options.isPlaying() && media.paused) {
            void media.play().catch(() => undefined);
          }
          options.onRenderOnce?.();
        };
        videoListeners.set(media, handleFrameReady);
        media.addEventListener("seeked", handleFrameReady);
        media.addEventListener("canplay", handleFrameReady);
        media.addEventListener("loadeddata", handleFrameReady);

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
      const rate = layer.playbackRate ?? 1.0;
      if (media.playbackRate !== rate) {
        media.playbackRate = rate;
      }
      const localTime =
        (currentTime - layer.startMs / 1000) * rate + (layer.sourceOffsetMs ?? 0) / 1000;
      if (
        localTime < 0 ||
        (Number.isFinite(media.duration) && localTime >= media.duration)
      )
        continue;
      const drift = Math.abs(media.currentTime - localTime);
      if (!isPlaying) {
        media.pause();
        performMediaSeek(media, localTime);
        continue;
      }
      // When playing, NEVER performMediaSeek if the video is already actively playing and decoding.
      // Seeking on dropped frames causes catastrophic decoder stutters. Only resync if drift exceeds 1.5s or if media is paused.
      if (drift > 1.5) {
        performMediaSeek(media, localTime);
      }
      if (media.paused && !media.seeking) {
        void media.play().catch(() => undefined);
      }
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
    onlyLayerId?: string,
  ) => {
    const comp = options.composition();
    const currentTime = options.currentTime();
    const timeMs = currentTime * 1000;
    const selectedTransformLayer = options.selectedTransformLayer();
    const webcamDraft = options.webcamDraft();

    for (const layer of activeLayersAt(comp, timeMs)) {
      if (onlyLayerId && layer.id !== onlyLayerId) continue;
      if (
        layer.kind === "audio" ||
        (layer.kind === "video" && layer.reactToZoom)
      )
        continue;

      if (layer.kind === "caption") {
        if (followsZoom) continue;
        const sentence = layer.caption.sentences.find(
          (item) => item.startMs <= timeMs && timeMs <= item.endMs,
        );
        const textToDisplay = layer.caption.style.customText || sentence?.text;
        if (!textToDisplay) continue;

        const style = layer.caption.style;
        const fontSizePx = Math.max(
          12,
          (style.fontSize * videoWindow.dw) / Math.max(1, mainVideoWidth || 1920),
        );

        ctx.save();
        ctx.font = `800 ${fontSizePx}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        const liveTransform =
          layer.id === selectedTransformLayer?.id && webcamDraft
            ? webcamDraft
            : getCaptionTransform(layer);

        const boxX = videoWindow.dx + liveTransform.x * videoWindow.dw;
        const boxY = videoWindow.dy + liveTransform.y * videoWindow.dh;
        const boxW = liveTransform.width * videoWindow.dw;
        const boxH = liveTransform.height * videoWindow.dh;
        const centerX = boxX + boxW / 2;
        const centerY = boxY + boxH / 2;

        const strokeWidthPx = Math.max(
          1,
          ((style.boxPadding ?? 6) * videoWindow.dw) /
            Math.max(1, mainVideoWidth || 1920),
        );
        const extrusionPx = Math.max(
          0,
          ((style.boxRadius ?? 4) * videoWindow.dw) /
            Math.max(1, mainVideoWidth || 1920),
        );

        const outlineColor = style.boxColor ?? "#000000";

        // 1. Configure Drop Shadow if enabled
        const hasShadow = Boolean(style.shadowBlur && style.shadowBlur > 0);
        if (hasShadow) {
          const blur = style.shadowBlur!;
          const dir = style.shadowDirection ?? "bottom-right";
          ctx.shadowColor = style.shadowColor || "rgba(0, 0, 0, 0.85)";
          ctx.shadowBlur = blur;
          ctx.shadowOffsetX =
            style.shadowOffsetX ??
            (dir === "top-left"
              ? -blur * 0.5
              : dir === "bottom-right"
                ? blur * 0.5
                : 0);
          ctx.shadowOffsetY =
            style.shadowOffsetY ??
            (dir === "top-left"
              ? -blur * 0.5
              : dir === "bottom" || dir === "bottom-right"
                ? blur * 0.5
                : 0);
        }

        // 2. Draw 3D Extruded Shadow / Depth Layer (behind stroke)
        if (extrusionPx > 0) {
          ctx.save();
          const shadowCol = style.shadowColor || "rgba(0, 0, 0, 0.85)";
          ctx.strokeStyle = shadowCol;
          ctx.fillStyle = shadowCol;
          ctx.lineWidth = strokeWidthPx * 2;

          const totalSteps = Math.round(extrusionPx);
          for (let i = totalSteps; i >= 1; i--) {
            const stepOffset = i * (videoWindow.dw / Math.max(1, mainVideoWidth || 1920));
            // Only project canvas shadow on the deepest step
            if (i !== totalSteps) {
              ctx.shadowColor = "transparent";
            }
            ctx.strokeText(
              textToDisplay,
              centerX + stepOffset,
              centerY + stepOffset,
              Math.max(10, boxW - 8),
            );
            ctx.fillText(
              textToDisplay,
              centerX + stepOffset,
              centerY + stepOffset,
              Math.max(10, boxW - 8),
            );
          }
          ctx.restore();
          ctx.shadowColor = "transparent";
        }

        // 3. Draw Thick Outline Stroke around text glyphs
        if (outlineColor && outlineColor !== "transparent" && strokeWidthPx > 0) {
          ctx.save();
          if (!extrusionPx) {
            // Keep drop shadow on outline stroke if no 3D extrusion is active
          } else {
            ctx.shadowColor = "transparent";
          }
          ctx.strokeStyle = outlineColor;
          ctx.lineWidth = strokeWidthPx * 2;
          ctx.strokeText(
            textToDisplay,
            centerX,
            centerY,
            Math.max(10, boxW - 8),
          );
          ctx.restore();
          ctx.shadowColor = "transparent";
        }

        // 4. Draw Main Inner Text Fill Color on top
        if (!extrusionPx && (!outlineColor || outlineColor === "transparent" || strokeWidthPx <= 0)) {
          // Keep drop shadow on plain text fill if no outline or 3D extrusion
        } else {
          ctx.shadowColor = "transparent";
        }
        ctx.fillStyle = style.color || "#ffffff";
        ctx.fillText(textToDisplay, centerX, centerY, Math.max(10, boxW - 8));
        ctx.restore();
        continue;
      }

      const layerReactsToZoom = Boolean(layer.reactToZoom);
      if (followsZoom !== layerReactsToZoom) continue;

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
        asset.readyState < HTMLMediaElement.HAVE_METADATA
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

      drawDecoratedMedia(ctx, { source: asset, sourceRect: crop && sourceWidth > 0 && sourceHeight > 0 ? { x: crop.x * sourceWidth, y: crop.y * sourceHeight, width: crop.width * sourceWidth, height: crop.height * sourceHeight } : undefined, rect: { x: dx, y: dy, width: dw, height: dh }, appearance, title: layer.name, mirrored: layer.isMirrored });
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
    onlyLayerId?: string,
  ) => {
    const comp = options.composition();
    const currentTime = options.currentTime();
    const timeMs = currentTime * 1000;
    const selectedTransformLayer = options.selectedTransformLayer();
    const webcamDraft = options.webcamDraft();

    for (const layer of activeLayersAt(comp, timeMs)) {
      if (onlyLayerId && layer.id !== onlyLayerId) continue;
      if (layer.kind !== "video" || !layer.reactToZoom) continue;
      const asset = compositionVideos.get(layer.assetId);
      const localTime =
        currentTime - layer.startMs / 1000 + (layer.sourceOffsetMs ?? 0) / 1000;

      if (
        !asset ||
        localTime < 0 ||
        (Number.isFinite(asset.duration) && localTime >= asset.duration) ||
        asset.readyState < HTMLMediaElement.HAVE_METADATA
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
        layer.appearance,
        layer.name,
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
