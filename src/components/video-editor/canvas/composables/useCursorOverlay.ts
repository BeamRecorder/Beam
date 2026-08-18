import { ref, watch } from 'vue';
import type { ProjectEditorData } from '~/api/types/capture-session';
import { buttonEventsBetween, cursorStateAt } from '../../composables/cursorPlayback';
import { useCursorReplacer } from '../../properties/cursor/useCursorReplacer';
import { ZOOM_DEPTH_SCALES } from '../../zoom/zoom-types';
import { cursorClickSpringScale } from '../../composables/cursor-click-spring';
import { cursorShadowOffset } from '../../properties/cursor/cursor-shadow';
import type { ShadowDirection } from '../../properties/cursor/shadow-types';
import { cursorAssetAt, cursorGeometryAtSize, cursorPositionAt } from '../../properties/cursor/cursor-rendering';
import type { CursorPackDescriptor, CursorSelection } from '../../../../api/types/cursor-pack';
import { MACOS_CURSOR_PACK } from '../../properties/cursor/cursor-packs';
import type { VisualClip } from '~/media/shared/composition-types';
import { createCursorMotionPlayer, motionBlurTrail } from '../../composables/cursor-motion';
import {
  effectButtonForRecordedButton,
  type CursorClickEffectSettings,
  type CursorClickEffects,
  type CursorMotionSettings,
} from '../../../../api/types/cursor-settings';
import type { OutputCanvasSettings } from '../output-canvas';
import { cursorRippleAt } from '../../composables/cursor-ripple';

export interface UseCursorOverlayOptions {
  cursorSelection: () => CursorSelection;
  cursorPack: () => CursorPackDescriptor | null;
  cursorSize: () => number;
  cursorColor: () => string;
  enableShadow: () => boolean;
  clickEffects: () => CursorClickEffects;
  motion: () => CursorMotionSettings;
  shadowBlur: () => number;
  shadowColor: () => string;
  shadowDirection: () => ShadowDirection;
  outputCanvas: () => OutputCanvasSettings;
  deviceScale: () => number;
  currentTime: () => number;
  isPlaying: () => boolean;
  editorData: () => ProjectEditorData | null | undefined;
  screenClip: () => VisualClip | null;
  isScreenEnabled: () => boolean;
  showBackground: () => boolean;
  onRenderOnce?: () => void;
}

export const getRippleStyleColor = (hex: string, alpha: number) => {
  if (!hex.startsWith('#')) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16) || 0;
  const g = Number.parseInt(hex.slice(3, 5), 16) || 0;
  const b = Number.parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function useCursorOverlay(options: UseCursorOverlayOptions) {
  const { getCursorImage } = useCursorReplacer();
  const customCursorImage = ref<HTMLImageElement | null>(null);
  let motionPlayer: ReturnType<typeof createCursorMotionPlayer> | null = null;
  let motionPlayerEvents: ProjectEditorData['cursor']['events'] | null = null;
  let motionPlayerKey = '';
  let sampledPlayer: ReturnType<typeof createCursorMotionPlayer> | null = null;
  let sampledTime = Number.NaN;
  let sampledMotion: ReturnType<ReturnType<typeof createCursorMotionPlayer>['sample']> = null;
  const maxZoomScale = Math.max(...Object.values(ZOOM_DEPTH_SCALES));

  watch(
    () =>
      [
        options.cursorSelection().packId,
        options.cursorSelection().mode,
        options.cursorSelection().cursorId,
        options.currentTime(),
        options.cursorSize(),
        options.cursorColor(),
        options.deviceScale(),
      ] as const,
    async () => {
      try {
        const state = cursorStateAt(options.editorData()?.cursor.events ?? [], options.currentTime());
        const pack = options.cursorPack() ?? MACOS_CURSOR_PACK;
        const selection = options.cursorPack()
          ? options.cursorSelection()
          : { packId: MACOS_CURSOR_PACK.id, mode: 'automatic' as const, cursorId: null };
        const asset = cursorAssetAt(pack, selection, state);
        const geometry = cursorGeometryAtSize(asset, options.cursorSize() * maxZoomScale * options.deviceScale());
        customCursorImage.value = await getCursorImage(
          pack,
          asset,
          geometry.width,
          geometry.height,
          options.cursorColor(),
        );
        options.onRenderOnce?.();
      } catch {
        console.error('Failed to load custom cursor image.');
        customCursorImage.value = null;
      }
    },
    { immediate: true },
  );

  const warning = (ctx: CanvasRenderingContext2D, message: string, width: number) => {
    ctx.save();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(15,23,42,.82)';
    const padding = 8;
    const textWidth = ctx.measureText(message).width;
    ctx.roundRect(width - textWidth - padding * 2 - 8, 12, textWidth + padding * 2, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(message, width - 8 - padding, 29);
    ctx.restore();
  };

  const positionAt = (
    state: NonNullable<ReturnType<typeof cursorStateAt>>,
    videoWindow: { dx: number; dy: number; dw: number; dh: number },
    videoWidth: number,
    videoHeight: number,
  ) => {
    const screen = options.screenClip();
    return cursorPositionAt(
      state,
      { width: videoWidth, height: videoHeight },
      { x: videoWindow.dx, y: videoWindow.dy, width: videoWindow.dw, height: videoWindow.dh },
      options.showBackground(),
      screen?.transform ?? { x: 0, y: 0, width: 1, height: 1 },
      screen?.isMirrored ?? false,
      screen?.isMirroredY ?? false,
      screen?.appearance,
      screen?.crop,
    );
  };

  const settingsForButton = (button: number): CursorClickEffectSettings | null => {
    const effectButton = effectButtonForRecordedButton(button);
    return effectButton ? options.clickEffects()[effectButton] : null;
  };

  const previewScaleFor = (videoWindow: { dw: number; dh: number }) =>
    Math.min(
      videoWindow.dw / Math.max(1, options.outputCanvas().width),
      videoWindow.dh / Math.max(1, options.outputCanvas().height),
    );

  const playerFor = (events: ProjectEditorData['cursor']['events'], videoWidth: number, videoHeight: number) => {
    const motion = options.motion();
    const key = `${events.length}:${events.at(-1)?.sessionNs ?? 0}:${videoWidth}:${videoHeight}:${motion.preset}:${motion.smoothing}:${motion.springMassMultiplier}:${motion.motionBlur}`;
    if (!motionPlayer || motionPlayerEvents !== events || motionPlayerKey !== key) {
      motionPlayer = createCursorMotionPlayer(events, motion, videoWidth, videoHeight);
      motionPlayerEvents = events;
      motionPlayerKey = key;
      sampledPlayer = null;
    }
    return motionPlayer;
  };

  const motionStateAt = (
    events: ProjectEditorData['cursor']['events'],
    time: number,
    width: number,
    height: number,
  ) => {
    const player = playerFor(events, width, height);
    if (sampledPlayer !== player || sampledTime !== time) {
      sampledPlayer = player;
      sampledTime = time;
      sampledMotion = player.sample(time, cursorStateAt(events, time));
    }
    return { player, motion: sampledMotion };
  };

  const updateAndDrawRipplesAndCursor = (
    ctx: CanvasRenderingContext2D,
    videoWindow: { dx: number; dy: number; dw: number; dh: number; focusX: number; focusY: number; scale: number },
    videoWidth: number,
    videoHeight: number,
    logicalWidth: number,
    drawInCameraSpace: (drawContent: () => void) => void,
  ) => {
    const cursorData = options.editorData()?.cursor;
    if (!cursorData?.available) {
      if (options.isScreenEnabled() && cursorData && !cursorData.available)
        warning(ctx, 'Cursor data missing', logicalWidth);
      return;
    }
    if (!options.cursorPack()) warning(ctx, 'Cursor pack unavailable — import it again', logicalWidth);
    if (!(videoWidth > 0) || !(videoHeight > 0)) return;
    const time = options.currentTime();
    const state = cursorStateAt(cursorData.events, time);
    const { player, motion: motionState } = motionStateAt(cursorData.events, time, videoWidth, videoHeight);
    drawInCameraSpace(() => {
      const previewScale = previewScaleFor(videoWindow);
      for (const button of buttonEventsBetween(cursorData.events, Math.max(0, time - 0.5), time)) {
        const effect = settingsForButton(button.button);
        const ripple = effect?.rippleEnabled
          ? cursorRippleAt(time - button.sessionNs / 1_000_000_000, effect.rippleSize)
          : null;
        const stateAtClick = cursorStateAt(cursorData.events, button.sessionNs / 1_000_000_000);
        if (!effect || !ripple || !stateAtClick) continue;
        const target = player.timeline.targetAt(button.sessionNs / 1_000_000_000);
        const position = positionAt(
          target ? { ...stateAtClick, x: target.x, y: target.y } : stateAtClick,
          videoWindow,
          videoWidth,
          videoHeight,
        );
        ctx.strokeStyle = getRippleStyleColor(effect.rippleColor, ripple.opacity);
        ctx.lineWidth = Math.max(1, 3 * previewScale);
        ctx.beginPath();
        ctx.arc(position.x, position.y, ripple.radius * previewScale, 0, Math.PI * 2);
        ctx.stroke();
      }
      const image = customCursorImage.value;
      if (!state?.visible || !image?.complete || image.naturalWidth <= 0) return;
      if (!motionState) return;
      const size = options.cursorSize() * previewScale;
      const pack = options.cursorPack() ?? MACOS_CURSOR_PACK;
      const selection = options.cursorPack()
        ? options.cursorSelection()
        : { packId: MACOS_CURSOR_PACK.id, mode: 'automatic' as const, cursorId: null };
      const geometry = cursorGeometryAtSize(cursorAssetAt(pack, selection, motionState), size);
      const click = buttonEventsBetween(cursorData.events, Math.max(0, time - 0.28), time)
        .reverse()
        .find((event) => settingsForButton(event.button)?.springEnabled);
      const age = click ? Math.max(0, time - click.sessionNs / 1_000_000_000) : Infinity;
      const spring = click ? settingsForButton(click.button) : null;
      const scale = cursorClickSpringScale(age, Boolean(spring?.springEnabled), spring?.springIntensity ?? 0);
      const trail = motionBlurTrail(
        { x: motionState.x, y: motionState.y },
        { x: motionState.previousX, y: motionState.previousY },
        motionState.deltaSeconds,
        options.motion().motionBlur,
        { width: videoWindow.dw, height: videoWindow.dh },
      );
      for (const sample of trail) {
        const sampleState = { ...motionState, x: sample.x, y: sample.y };
        const samplePosition = positionAt(sampleState, videoWindow, videoWidth, videoHeight);
        ctx.save();
        ctx.globalAlpha = sample.alpha;
        if (options.enableShadow()) {
          ctx.shadowColor = options.shadowColor();
          const shadowBlur = options.shadowBlur() * previewScale;
          ctx.shadowBlur = shadowBlur;
          const offset = cursorShadowOffset(shadowBlur, options.shadowDirection());
          ctx.shadowOffsetX = offset.x;
          ctx.shadowOffsetY = offset.y;
        }
        ctx.translate(samplePosition.x, samplePosition.y);
        ctx.scale(scale, scale);
        ctx.drawImage(image, -geometry.hotspot.x, -geometry.hotspot.y, geometry.width, geometry.height);
        ctx.restore();
      }
    });
  };

  const cursorPositionForKeyboardCaption = (
    videoWindow: { dx: number; dy: number; dw: number; dh: number; focusX: number; focusY: number; scale: number },
    videoWidth: number,
    videoHeight: number,
  ) => {
    const cursorData = options.editorData()?.cursor;
    const screen = options.screenClip();
    const image = customCursorImage.value;
    if (!cursorData?.available || !screen || !options.isScreenEnabled() || !image?.complete || image.naturalWidth <= 0)
      return null;
    const time = options.currentTime();
    const state = cursorStateAt(cursorData.events, time);
    const motionState = motionStateAt(cursorData.events, time, videoWidth, videoHeight).motion;
    if (!state?.visible || !motionState?.visible) return null;
    const raw = positionAt(motionState, videoWindow, videoWidth, videoHeight);
    return {
      x: videoWindow.dx + videoWindow.dw / 2 + videoWindow.scale * (raw.x - videoWindow.focusX),
      y: videoWindow.dy + videoWindow.dh / 2 + videoWindow.scale * (raw.y - videoWindow.focusY),
    };
  };

  return { customCursorImage, cursorPositionForKeyboardCaption, updateAndDrawRipplesAndCursor };
}
