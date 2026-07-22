import { zoomAtTime } from "../../video-editor/zoom/zoom-playback";
import {
  buttonEventsBetween,
  cursorStateAt,
} from "../../video-editor/composables/cursorPlayback";
import type {
  CompositionSnapshot,
  CursorRenderSettings,
} from "../export-types";
import { activeLayersAt } from "../../video-editor/composition/composition-types";
import { drawWebcamOverlay, webcamSettingsForAppearance } from "../../video-editor/composition/webcam/webcam-zoom";
import { coverSourceRect, framedMediaRect, outputPoint } from '../../video-editor/canvas/output-canvas';

export type CompositionVisuals = ReadonlyMap<string, CanvasImageSource>;

export function drawCompositionLayers(
  ctx: CanvasRenderingContext2D,
  snapshot: CompositionSnapshot,
  time: number,
  visuals: CompositionVisuals = new Map(),
  followsZoom = false,
) {
  const { width, height } = snapshot.canvas;
  for (const layer of activeLayersAt(snapshot.composition, time * 1000)) {
    if (
      layer.kind === "audio" ||
      (layer.kind === 'video' && layer.reactToZoom) ||
      (followsZoom ? layer.kind === 'video' : layer.kind !== 'video')
    ) continue;
    if (layer.kind === "caption") {
      const sentence = layer.caption.sentences.find(
        (item) => item.startMs <= time * 1000 && time * 1000 <= item.endMs,
      );
      if (!sentence?.text) continue;
      const style = layer.caption.style;
      ctx.save();
      ctx.font = `${Math.max(12, style.fontSize)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = style.color;
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = Math.max(0, style.shadowBlur);
      const y =
        style.placement === "top"
          ? height * 0.12
          : style.placement === "center"
            ? height / 2
            : height * 0.88;
      ctx.fillText(sentence.text, width / 2, y, width * 0.9);
      ctx.restore();
      continue;
    }
    const asset = visuals.get(layer.assetId);
    if (!asset) continue;
    const transform = layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
    ctx.drawImage(
      asset,
      transform.x * width,
      transform.y * height,
      transform.width * width,
      transform.height * height,
    );
  }
}

export function renderCompositionFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  snapshot: CompositionSnapshot,
  time: number,
  background?: CanvasImageSource | null,
  cursorImages?: ReadonlyMap<string, HTMLImageElement>,
  visuals?: CompositionVisuals,
  replacementCursor?: HTMLImageElement | null,
) {
  const { width, height } = snapshot.canvas;
  ctx.fillStyle = "#1e1e24";
  ctx.fillRect(0, 0, width, height);
  if (
    !snapshot.video.enabled ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    if (background) ctx.drawImage(background, 0, 0, width, height);
    drawCompositionLayers(ctx, snapshot, time, visuals, true);
    drawCompositionLayers(ctx, snapshot, time, visuals);
    return;
  }
  const zoom = zoomAtTime(
    snapshot.zooms,
    time * 1000,
    snapshot.cursor.telemetry,
  );
  const scale = zoom?.scale ?? 1;
  const focus = zoom?.focus ?? { cx: 0.5, cy: 0.5 };
  const sourceWidth = video.videoWidth || snapshot.video.width;
  const sourceHeight = video.videoHeight || snapshot.video.height;
  const source = snapshot.canvas.fit === 'cover' ? coverSourceRect(sourceWidth, sourceHeight, width, height) : { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const media = snapshot.canvas.fit === 'contain' ? framedMediaRect(sourceWidth, sourceHeight, width, height) : { x: 0, y: 0, width, height };
  const outputFocus = zoom?.mode === 'auto' ? outputPoint(focus.cx, focus.cy, sourceWidth, sourceHeight, width, height, snapshot.canvas.fit) : focus;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-outputFocus.cx * width, -outputFocus.cy * height);
  if (background) ctx.drawImage(background, 0, 0, width, height);
  ctx.drawImage(video, source.x, source.y, source.width, source.height, media.x, media.y, media.width, media.height);
  const cursor = cursorStateAt(snapshot.cursor.events, time);
  const settings: CursorRenderSettings = snapshot.cursorSettings;
  if (settings.ripple.enabled) {
    for (const click of buttonEventsBetween(
      snapshot.cursor.events,
      Math.max(0, time - 0.5),
      time,
    )) {
      const state = cursorStateAt(
        snapshot.cursor.events,
        click.sessionNs / 1_000_000_000,
      );
      if (!state) continue;
      const age = Math.max(0, time - click.sessionNs / 1_000_000_000);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 0.5);
      ctx.strokeStyle = settings.ripple.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        outputPoint(state.x, state.y, sourceWidth, sourceHeight, width, height, snapshot.canvas.fit).cx * width,
        outputPoint(state.x, state.y, sourceWidth, sourceHeight, width, height, snapshot.canvas.fit).cy * height,
        2 + age * settings.ripple.size * 2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  }
  const image =
    replacementCursor ??
    (cursor?.shapeId ? cursorImages?.get(cursor.shapeId) : undefined);
  if (cursor?.visible && image?.complete && image.naturalWidth > 0) {
    const hotspot = replacementCursor
      ? { x: 0, y: 0 }
      : (snapshot.cursor.shapes[cursor.shapeId!]?.hotspot ?? { x: 0, y: 0 });
    const size = replacementCursor ? settings.size : 32;
    const scale = size / image.naturalWidth;
    ctx.save();
    if (settings.shadow.enabled) {
      ctx.shadowColor = settings.shadow.color;
      ctx.shadowBlur = settings.shadow.blur;
      ctx.shadowOffsetX = settings.shadow.blur * 0.33;
      ctx.shadowOffsetY = settings.shadow.blur * 0.5;
    }
    ctx.drawImage(
      image,
      outputPoint(cursor.x, cursor.y, sourceWidth, sourceHeight, width, height, snapshot.canvas.fit).cx * width - hotspot.x * scale,
      outputPoint(cursor.x, cursor.y, sourceWidth, sourceHeight, width, height, snapshot.canvas.fit).cy * height - hotspot.y * scale,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    ctx.restore();
  }
  drawCompositionLayers(ctx, snapshot, time, visuals, true);
  ctx.restore();
  for (const layer of activeLayersAt(snapshot.composition, time * 1000)) {
    if (layer.kind !== "video" || !layer.reactToZoom) continue;
    const source = visuals?.get(layer.assetId);
    if (source) drawWebcamOverlay(ctx, source, width, height, scale, webcamSettingsForAppearance(layer.webcamAppearance));
  }
  drawCompositionLayers(ctx, snapshot, time, visuals);
}
