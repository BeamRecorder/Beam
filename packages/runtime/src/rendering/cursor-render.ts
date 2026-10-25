import { snapshotCursorImageKey } from './snapshot-cursor';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import { cursorClickSpringScale } from '@beam/engine/cursor/cursor-click-spring';
import { screenCursorEnabled } from '@beam/engine/capture/screen-cursor';
import { createCursorMotionPlayer, type CursorMotionSample } from '@beam/engine/cursor/cursor-motion';
import { cursorExposureSamples } from '@beam/engine/cursor/cursor-exposure';
import { drawGpuCursor } from './cursor-gpu-render';
import {
  buttonEventsBetween,
  cursorAutoHideOpacityAt,
  cursorStateAt,
  type CursorPlaybackState,
} from '@beam/engine/cursor/cursorPlayback';
import { cursorShadowOffset } from '@beam/runtime/cursor/cursor-shadow';
import { cursorAssetAt, cursorGeometryAtSize, cursorPositionAt } from '@beam/runtime/cursor/cursor-rendering';
import { effectButtonForRecordedButton, type CursorClickEffectSettings } from '@beam/engine/capture/cursor-settings';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { CURSOR_CLICK_LIMITS, CURSOR_RING_DEFAULTS } from '@beam/engine/capture/cursor-click-schema';
import { cursorRippleAt } from '@beam/engine/cursor/cursor-ripple';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { transitionPointWithClip } from '@beam/runtime/composition/transitions/render-transition';
import { createScenePointMapper } from '@beam/engine/scene/scene-spatial';
import { hasPerspectiveTilt, projectPerspectivePoint } from '@beam/engine/zoom/perspective-projection';
import type { CameraSample } from '@beam/engine/zoom/composition-camera-types';

type CursorImage = HTMLImageElement | ImageBitmap;
const usableImage = (image: CursorImage | undefined) => {
  if (!image) return false;
  if ('complete' in image) return image.complete && image.naturalWidth > 0;
  return image.width > 0;
};

export function cursorPositionForKeyboardCaption(
  snapshot: CompositionSnapshot,
  timelineTimeMs: number,
  screen: VisualClip,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  cursorImages: ReadonlyMap<string, CursorImage> | undefined,
  motionState: CursorMotionSample | null,
  camera: CameraSample,
) {
  const asset = snapshot.cursorPack
    ? cursorAssetAt(snapshot.cursorPack, snapshot.cursorSettings.selection, motionState)
    : null;
  const image = asset ? cursorImages?.get(snapshotCursorImageKey(snapshot, screen, asset.id)) : undefined;
  if (!snapshot.cursor.available || !motionState?.visible || !usableImage(image)) return null;
  const raw = transitionPointWithClip(
    screen,
    timelineTimeMs,
    { width, height },
    cursorPositionAt(
      motionState,
      { width: sourceWidth, height: sourceHeight },
      { x: 0, y: 0, width, height },
      snapshot.canvas.showBackground,
      screen,
    ),
  );
  const point = snapshot.composition.scene
    ? createScenePointMapper(snapshot.composition, width, height)(
        screen.id,
        { cx: raw.x / width, cy: raw.y / height },
        timelineTimeMs,
      )
    : { cx: raw.x / width, cy: raw.y / height };
  const position = {
    x: width / 2 + camera.scale * (point.cx * width - camera.focus.cx * width),
    y: height / 2 + camera.scale * (point.cy * height - camera.focus.cy * height),
  };
  const transform = { tiltX: camera.tiltX ?? 0, tiltY: camera.tiltY ?? 0, orbit: camera.orbit };
  return hasPerspectiveTilt(transform)
    ? projectPerspectivePoint(position, { x: 0, y: 0, width, height }, transform)
    : position;
}

export function drawCursorLayer(
  ctx: Canvas2DContext,
  snapshot: CompositionSnapshot,
  time: number,
  screen: VisualClip,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  cursorImages: ReadonlyMap<string, CursorImage> | undefined,
  cursorMotionPlayer: ReturnType<typeof createCursorMotionPlayer>,
  motionCursor: CursorMotionSample | null,
  pixelScale = 1,
) {
  const settings = snapshot.cursorSettings;
  if (!screenCursorEnabled(screen, settings.enabled !== false)) return;
  // Cursor size and shadow blur are output pixels. Keep the value selected in
  // the editor stable when the user exports at a different video resolution.
  // A supersampled lens pass preserves that size before the lens magnifies it.
  const cursorSize = settings.size * pixelScale;
  const shadowBlur = settings.shadow.blur * pixelScale;
  const settingsForButton = (button: number): CursorClickEffectSettings | null => {
    const effectButton = effectButtonForRecordedButton(button);
    return effectButton ? settings.clickEffects[effectButton] : null;
  };
  const positionAt = (state: CursorPlaybackState) =>
    cursorPositionAt(
      state,
      { width: sourceWidth, height: sourceHeight },
      { x: 0, y: 0, width, height },
      snapshot.canvas.showBackground,
      screen,
    );

  for (const click of buttonEventsBetween(
    snapshot.cursor.events,
    time - CURSOR_CLICK_LIMITS.rippleDurationMs.max / 1000,
    time,
  )) {
    const effect = settingsForButton(click.button);
    if (!effect?.rippleEnabled) continue;
    const state = cursorStateAt(snapshot.cursor.events, click.sessionNs / 1_000_000_000);
    if (!state) continue;
    const target = cursorMotionPlayer.timeline.targetAt(click.sessionNs / 1_000_000_000);
    const position = positionAt(target ? { ...state, x: target.x, y: target.y } : state);
    const age = Math.max(0, time - click.sessionNs / 1_000_000_000);
    const style = effect.rippleStyle ?? 'single';
    const ripple = cursorRippleAt(
      age,
      effect.rippleSize,
      style,
      (effect.rippleDurationMs ?? CURSOR_RING_DEFAULTS.rippleDurationMs) / 1000,
    );
    if (!ripple) continue;
    ctx.save();
    const baseAlpha = ctx.globalAlpha;
    for (const ring of ripple.rings) {
      ctx.globalAlpha = (baseAlpha * ring.opacity * (effect.rippleOpacity ?? CURSOR_RING_DEFAULTS.rippleOpacity)) / 100;
      if (ring.filled) {
        ctx.fillStyle = effect.rippleColor;
        ctx.beginPath();
        ctx.arc(position.x, position.y, ring.radius * pixelScale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = effect.rippleColor;
        ctx.lineWidth = (effect.rippleWidth ?? CURSOR_RING_DEFAULTS.rippleWidth) * pixelScale;
        ctx.beginPath();
        ctx.arc(position.x, position.y, ring.radius * pixelScale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const asset = snapshot.cursorPack ? cursorAssetAt(snapshot.cursorPack, settings.selection, motionCursor) : null;
  const image = asset ? cursorImages?.get(snapshotCursorImageKey(snapshot, screen, asset.id)) : undefined;
  const autoHideOpacity = cursorAutoHideOpacityAt(snapshot.cursor.events, time, settings.autoHide);
  if (!motionCursor?.visible || autoHideOpacity <= 0 || !usableImage(image)) return;
  const geometry = cursorGeometryAtSize(asset!, cursorSize);
  const click = buttonEventsBetween(snapshot.cursor.events, Math.max(0, time - 0.28), time)
    .reverse()
    .find((event) => settingsForButton(event.button)?.springEnabled);
  const age = click ? Math.max(0, time - click.sessionNs / 1_000_000_000) : Infinity;
  const spring = click ? settingsForButton(click.button) : null;
  const clickScale = cursorClickSpringScale(age, Boolean(spring?.springEnabled), spring?.springIntensity ?? 0);
  const transform = ctx.getTransform();
  const resolution = Math.max(1, Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d));
  const trail = cursorExposureSamples({
    time,
    motion: motionCursor,
    intensity: settings.motion.motionBlur,
    width,
    height,
    resolution,
    sourceRate: screen.freezeFrameSourceMs === undefined ? screen.playbackRate : 0,
    sampleAt: (at) => cursorMotionPlayer.sample(at, cursorStateAt(snapshot.cursor.events, at)),
  });
  if (settings.motion.model3d || trail.length > 1) {
    const animated = [1, 2, 3].filter((button) => settingsForButton(button)?.springEnabled);
    ctx.save();
    ctx.globalAlpha *= autoHideOpacity;
    try {
      drawGpuCursor(ctx, {
        image: image!,
        geometry: settings.motion.model3d
          ? geometry
          : {
              width: geometry.width * clickScale,
              height: geometry.height * clickScale,
              hotspot: { x: geometry.hotspot.x * clickScale, y: geometry.hotspot.y * clickScale },
            },
        samples: trail.map((sample) => ({
          ...positionAt({ ...motionCursor, x: sample.x, y: sample.y }),
          weight: sample.weight,
        })),
        ...(settings.motion.model3d
          ? {
              volume: cursorMotionPlayer.modelPose(
                time,
                motionCursor,
                animated,
                (button) => (settingsForButton(button)?.springIntensity ?? 50) / 50,
              ),
            }
          : {}),
        shadow: { ...settings.shadow, blur: shadowBlur },
        resolution,
      });
    } finally {
      ctx.restore();
    }
    return;
  }
  for (const sample of trail) {
    const samplePosition = positionAt({ ...motionCursor, x: sample.x, y: sample.y });
    ctx.save();
    ctx.globalAlpha *= sample.weight * autoHideOpacity;
    if (settings.shadow.enabled) {
      ctx.shadowColor = settings.shadow.color;
      ctx.shadowBlur = shadowBlur;
      const offset = cursorShadowOffset(shadowBlur, settings.shadow.direction);
      ctx.shadowOffsetX = offset.x;
      ctx.shadowOffsetY = offset.y;
    }
    ctx.translate(samplePosition.x, samplePosition.y);
    ctx.scale(clickScale, clickScale);
    ctx.drawImage(image!, -geometry.hotspot.x, -geometry.hotspot.y, geometry.width, geometry.height);
    ctx.restore();
  }
}
