import type { VisualClip } from '~/media/shared/composition-types';
import { cursorClickSpringScale } from '../../video-editor/composables/cursor-click-spring';
import { createCursorMotionPlayer, motionBlurTrail } from '../../video-editor/composables/cursor-motion';
import { buttonEventsBetween, cursorStateAt } from '../../video-editor/composables/cursorPlayback';
import { cursorShadowOffset } from '../../video-editor/properties/cursor/cursor-shadow';
import {
  cursorHotspotAtSize,
  cursorPositionAt,
  cursorTypeAt,
} from '../../video-editor/properties/cursor/cursor-rendering';
import { effectButtonForRecordedButton, type CursorClickEffectSettings } from '../../../api/types/cursor-settings';
import type { CompositionSnapshot } from '../export-types';
import { cursorRippleAt } from '../../video-editor/composables/cursor-ripple';
import type { Canvas2DContext } from '~/types/canvas';

type CursorImage = HTMLImageElement | ImageBitmap;
const usableImage = (image: CursorImage | undefined) => {
  if (!image) return false;
  if ('complete' in image) return image.complete && image.naturalWidth > 0;
  return image.width > 0;
};

export function cursorPositionForKeyboardCaption(
  snapshot: CompositionSnapshot,
  time: number,
  screen: VisualClip,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  cursorImages: ReadonlyMap<string, CursorImage> | undefined,
  cursorMotionPlayer: ReturnType<typeof createCursorMotionPlayer>,
  camera: { scale: number; focus: { cx: number; cy: number } },
) {
  const state = cursorStateAt(snapshot.cursor.events, time);
  const motionState = cursorMotionPlayer.sample(time, state);
  const cursorType = cursorTypeAt(snapshot.cursorSettings.selectedCursor, motionState);
  const image = cursorImages?.get(cursorType);
  if (!snapshot.cursor.available || !state?.visible || !motionState?.visible || !usableImage(image)) return null;
  const raw = cursorPositionAt(
    motionState,
    { width: sourceWidth, height: sourceHeight },
    { x: 0, y: 0, width, height },
    snapshot.canvas.showBackground,
    screen.transform,
    screen.isMirrored ?? false,
    screen.isMirroredY ?? false,
    screen.appearance,
    screen.crop,
  );
  return {
    x: width / 2 + camera.scale * (raw.x - camera.focus.cx * width),
    y: height / 2 + camera.scale * (raw.y - camera.focus.cy * height),
  };
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
) {
  const cursor = cursorStateAt(snapshot.cursor.events, time);
  const motionCursor = cursorMotionPlayer.sample(time, cursor);
  const settings = snapshot.cursorSettings;
  // Cursor size and shadow blur are output pixels. Keep the value selected in
  // the editor stable when the user exports at a different video resolution.
  const cursorSize = settings.size;
  const shadowBlur = settings.shadow.blur;
  const settingsForButton = (button: number): CursorClickEffectSettings | null => {
    const effectButton = effectButtonForRecordedButton(button);
    return effectButton ? settings.clickEffects[effectButton] : null;
  };
  const positionAt = (state: NonNullable<typeof cursor>) =>
    cursorPositionAt(
      state,
      { width: sourceWidth, height: sourceHeight },
      { x: 0, y: 0, width, height },
      snapshot.canvas.showBackground,
      screen.transform,
      screen.isMirrored ?? false,
      screen.isMirroredY ?? false,
      screen.appearance,
      screen.crop,
    );

  for (const click of buttonEventsBetween(snapshot.cursor.events, Math.max(0, time - 0.5), time)) {
    const effect = settingsForButton(click.button);
    if (!effect?.rippleEnabled) continue;
    const state = cursorStateAt(snapshot.cursor.events, click.sessionNs / 1_000_000_000);
    if (!state) continue;
    const target = cursorMotionPlayer.timeline.targetAt(click.sessionNs / 1_000_000_000);
    const position = positionAt(target ? { ...state, x: target.x, y: target.y } : state);
    const age = Math.max(0, time - click.sessionNs / 1_000_000_000);
    const ripple = cursorRippleAt(age, effect.rippleSize);
    if (!ripple) continue;
    ctx.save();
    ctx.globalAlpha = ripple.opacity;
    ctx.strokeStyle = effect.rippleColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(position.x, position.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const cursorType = cursorTypeAt(settings.selectedCursor, motionCursor);
  const image = cursorImages?.get(cursorType);
  if (!motionCursor?.visible || !usableImage(image)) return;
  const hotspot = cursorHotspotAtSize(cursorType, cursorSize);
  const click = buttonEventsBetween(snapshot.cursor.events, Math.max(0, time - 0.28), time)
    .reverse()
    .find((event) => settingsForButton(event.button)?.springEnabled);
  const age = click ? Math.max(0, time - click.sessionNs / 1_000_000_000) : Infinity;
  const spring = click ? settingsForButton(click.button) : null;
  const clickScale = cursorClickSpringScale(age, Boolean(spring?.springEnabled), spring?.springIntensity ?? 0);
  const trail = motionBlurTrail(
    { x: motionCursor.x, y: motionCursor.y },
    { x: motionCursor.previousX, y: motionCursor.previousY },
    motionCursor.deltaSeconds,
    settings.motion.motionBlur,
    { width, height },
  );
  for (const sample of trail) {
    const samplePosition = positionAt({ ...motionCursor, x: sample.x, y: sample.y });
    ctx.save();
    ctx.globalAlpha = sample.alpha;
    if (settings.shadow.enabled) {
      ctx.shadowColor = settings.shadow.color;
      ctx.shadowBlur = shadowBlur;
      const offset = cursorShadowOffset(shadowBlur, settings.shadow.direction);
      ctx.shadowOffsetX = offset.x;
      ctx.shadowOffsetY = offset.y;
    }
    ctx.translate(samplePosition.x, samplePosition.y);
    ctx.scale(clickScale, clickScale);
    ctx.drawImage(image!, -hotspot.x, -hotspot.y, cursorSize, cursorSize);
    ctx.restore();
  }
}
