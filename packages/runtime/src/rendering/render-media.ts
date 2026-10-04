import type { Canvas2DContext } from '../canvas-types';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { RenderableMedia, MediaRenderCamera } from './render-types';
import { drawDecoratedMedia } from '../composition/appearance/render-decorated-media';
import { visualMediaOptions } from '../composition/appearance/visual-media-options';
import { drawWebcamOverlay, webcamReactsToZoom, webcamSettingsForAppearance } from '../composition/webcam/webcam-zoom';

export function drawVisualClip(
  ctx: Canvas2DContext,
  clip: VisualClip,
  media: RenderableMedia,
  canvas: { width: number; height: number },
  timeMs: number,
  appearanceScale = 1,
) {
  drawDecoratedMedia(ctx, { ...visualMediaOptions(clip, media, canvas), timeMs, shadowScale: appearanceScale });
}

export function drawWebcamClip(
  ctx: Canvas2DContext,
  clip: VisualClip,
  media: RenderableMedia,
  canvas: { width: number; height: number },
  timeMs: number,
  appearanceScale = 1,
  camera?: MediaRenderCamera,
) {
  const scale = camera?.scale || 1;
  ctx.save();
  try {
    if (camera) {
      ctx.translate(camera.focusX, camera.focusY);
      ctx.scale(1 / scale, 1 / scale);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }
    drawWebcamOverlay(
      ctx,
      media.source,
      { width: media.width, height: media.height },
      canvas.width,
      canvas.height,
      scale,
      {
        ...webcamSettingsForAppearance(clip.appearance, clip.isMirrored, clip.isMirroredY),
        rotation: clip.rotation,
        reactToZoom: webcamReactsToZoom(clip),
      },
      clip.transform,
      clip.crop,
      clip.appearance,
      clip.name,
      appearanceScale,
      clip.cameraFramingPreset ?? 'custom',
      timeMs,
    );
  } finally {
    ctx.restore();
  }
}
