import { ref, watch, onUnmounted } from 'vue';
import type { BackgroundMedia, BackgroundValue } from '../../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { MediaPlaybackEngine } from '~/media/playback';
import { inspectMedia, mediaSourceDescriptor, type MediaError, type MediaFrame } from '~/media/shared';
import { COMPOSITION_SCHEMA_VERSION, type ClipComposition, type MediaAsset } from '~/media/shared/composition-types';

const BACKGROUND_CLIP_ID = 'background-video';

const backgroundAsset = (background: BackgroundMedia): MediaAsset => ({
  id: background.id,
  kind: 'video',
  name: background.name,
  fileName: background.fileName ?? null,
  durationMs: 0,
  width: null,
  height: null,
  src: resolvePublicAssetUrl(background.path),
  origin: 'project',
});

const backgroundComposition = (asset: MediaAsset, durationMs: number): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [{ ...asset, durationMs }],
  clips: [
    {
      id: BACKGROUND_CLIP_ID,
      kind: 'video',
      name: asset.name,
      assetId: asset.id,
      timelineStartMs: 0,
      timelineDurationMs: durationMs,
      sourceInMs: 0,
      sourceDurationMs: durationMs,
      playbackRate: 1,
      enabled: true,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
    },
  ],
});

export function useCanvasBackground(
  selectedBackground: () => BackgroundValue | null,
  backgroundBlurPercent: () => number | undefined,
  renderCanvas: () => void,
) {
  const activeBgState = ref<BackgroundValue | null>(null);
  const activeBgImg = ref<HTMLImageElement | null>(null);
  const activeBgFrame = ref<MediaFrame | null>(null);
  const backgroundError = ref<MediaError | null>(null);
  const prevBgState = ref<BackgroundValue | null>(null);
  const prevBgImg = ref<HTMLImageElement | null>(null);
  const isTransitioningBackground = ref(false);
  let transitionStartTime: number | null = null;
  const TRANSITION_DURATION = 180;

  const bgImageCache = new Map<string, HTMLImageElement>();
  let backgroundLoadVersion = 0;
  let backgroundEngine: MediaPlaybackEngine | null = null;
  let stopFrameListener: (() => void) | null = null;
  let stopErrorListener: (() => void) | null = null;
  let shouldPlay = false;

  const disposeVideo = () => {
    stopFrameListener?.();
    stopErrorListener?.();
    stopFrameListener = null;
    stopErrorListener = null;
    activeBgFrame.value = null;
    backgroundEngine?.dispose();
    backgroundEngine = null;
  };

  const triggerBgTransition = () => {
    isTransitioningBackground.value = true;
    transitionStartTime = performance.now();
    renderCanvas();
  };

  const cacheBackgroundImage = (path: string, image: HTMLImageElement) => {
    bgImageCache.set(path, image);
    if (bgImageCache.size > 20) {
      const firstKey = bgImageCache.keys().next().value;
      if (firstKey) bgImageCache.delete(firstKey);
    }
  };

  const loadVideo = async (nextBg: BackgroundMedia, loadVersion: number) => {
    const asset = backgroundAsset(nextBg);
    const descriptor = mediaSourceDescriptor(asset);
    try {
      const inspection = await inspectMedia(descriptor);
      if (loadVersion !== backgroundLoadVersion) return;
      const durationMs = Math.max(1, Math.round(inspection.metadata.durationSeconds * 1_000));
      const engine = new MediaPlaybackEngine();
      backgroundEngine = engine;
      stopFrameListener = engine.on('frame', ({ clipId }) => {
        if (clipId !== BACKGROUND_CLIP_ID || engine !== backgroundEngine) return;
        activeBgFrame.value = engine.frameFor(BACKGROUND_CLIP_ID);
        renderCanvas();
      });
      stopErrorListener = engine.on('error', (error) => {
        if (engine !== backgroundEngine) return;
        backgroundError.value = error;
        renderCanvas();
      });
      await engine.loadComposition(backgroundComposition(asset, durationMs));
      if (loadVersion !== backgroundLoadVersion || engine !== backgroundEngine) {
        engine.dispose();
        return;
      }
      prevBgState.value = activeBgState.value?.kind === 'video' ? null : activeBgState.value;
      prevBgImg.value = activeBgImg.value;
      activeBgState.value = nextBg;
      activeBgImg.value = null;
      activeBgFrame.value = engine.frameFor(BACKGROUND_CLIP_ID);
      triggerBgTransition();
      if (shouldPlay) await engine.play(0);
    } catch (error) {
      if (loadVersion !== backgroundLoadVersion) return;
      backgroundError.value =
        error && typeof error === 'object' && 'detail' in error
          ? (error as { detail: MediaError }).detail
          : { kind: 'decode-failure', sourceId: nextBg.id, message: 'The background video could not be decoded.' };
      activeBgState.value = nextBg;
      activeBgImg.value = null;
      activeBgFrame.value = null;
      renderCanvas();
    }
  };

  const loadBackground = () => {
    const nextBg = selectedBackground();
    const loadVersion = ++backgroundLoadVersion;
    disposeVideo();
    backgroundError.value = null;
    if (!nextBg) {
      activeBgState.value = null;
      activeBgImg.value = null;
      renderCanvas();
      return;
    }

    if (nextBg.kind === 'image') {
      const cached = bgImageCache.get(nextBg.path);
      if (cached && cached.naturalWidth > 0) {
        prevBgState.value = activeBgState.value;
        prevBgImg.value = activeBgImg.value;
        activeBgState.value = nextBg;
        activeBgImg.value = cached;
        triggerBgTransition();
        return;
      }
      const image = new Image();
      image.src = resolvePublicAssetUrl(nextBg.path);
      image.addEventListener('load', () => {
        if (loadVersion !== backgroundLoadVersion || !image.naturalWidth) return;
        cacheBackgroundImage(nextBg.path, image);
        prevBgState.value = activeBgState.value;
        prevBgImg.value = activeBgImg.value;
        activeBgState.value = nextBg;
        activeBgImg.value = image;
        triggerBgTransition();
      });
    } else if (nextBg.kind === 'video') {
      void loadVideo(nextBg, loadVersion);
    } else {
      const clonedBg = JSON.parse(JSON.stringify(nextBg));
      const isSameKind =
        activeBgState.value?.kind === nextBg.kind && (nextBg.kind === 'color' || nextBg.kind === 'gradient');
      if (!isSameKind) {
        prevBgState.value = activeBgState.value;
        prevBgImg.value = activeBgImg.value;
      }
      activeBgState.value = clonedBg;
      activeBgImg.value = null;
      if (!isSameKind) {
        triggerBgTransition();
      } else {
        renderCanvas();
      }
    }
  };

  watch(selectedBackground, loadBackground, { immediate: true, deep: true });
  watch(backgroundBlurPercent, renderCanvas);

  onUnmounted(() => {
    backgroundLoadVersion += 1;
    disposeVideo();
  });

  const drawSingleBackground = (
    ctx: CanvasRenderingContext2D,
    bg: BackgroundValue | null,
    imgSource: HTMLImageElement | null,
    frame: MediaFrame | null,
    rect: { x: number; y: number; width: number; height: number },
    alpha: number,
  ) => {
    if (!bg || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));

    const blur = Math.min(48, Math.max(0, (backgroundBlurPercent() ?? 0) * 0.48));
    const overscan = blur > 0 ? blur * 2 : 0;

    if (blur > 0) {
      ctx.filter = `blur(${blur}px)`;
    }

    const targetRect = {
      x: rect.x - overscan,
      y: rect.y - overscan,
      width: rect.width + overscan * 2,
      height: rect.height + overscan * 2,
    };

    if (bg.kind === 'color') {
      ctx.fillStyle = bg.color;
      ctx.fillRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
    } else if (bg.kind === 'gradient') {
      const gradient =
        bg.gradient.type === 'radial'
          ? ctx.createRadialGradient(
              targetRect.x + targetRect.width / 2,
              targetRect.y + targetRect.height / 2,
              0,
              targetRect.x + targetRect.width / 2,
              targetRect.y + targetRect.height / 2,
              Math.max(targetRect.width, targetRect.height) / 2,
            )
          : (() => {
              const radians = ((bg.gradient.angle - 90) * Math.PI) / 180;
              const dx = (Math.cos(radians) * targetRect.width) / 2;
              const dy = (Math.sin(radians) * targetRect.height) / 2;
              return ctx.createLinearGradient(
                targetRect.x + targetRect.width / 2 - dx,
                targetRect.y + targetRect.height / 2 - dy,
                targetRect.x + targetRect.width / 2 + dx,
                targetRect.y + targetRect.height / 2 + dy,
              );
            })();
      for (const stop of bg.gradient.stops) {
        gradient.addColorStop(
          stop.position,
          `${stop.color}${Math.round(stop.alpha * 255)
            .toString(16)
            .padStart(2, '0')}`,
        );
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
    } else {
      const source = bg.kind === 'video' ? (frame?.bitmap ?? null) : imgSource?.naturalWidth ? imgSource : null;

      if (source) {
        const sourceWidth = bg.kind === 'video' ? frame!.width : imgSource!.naturalWidth;
        const sourceHeight = bg.kind === 'video' ? frame!.height : imgSource!.naturalHeight;
        ctx.drawImage(
          source,
          0,
          0,
          sourceWidth,
          sourceHeight,
          targetRect.x,
          targetRect.y,
          targetRect.width,
          targetRect.height,
        );
      } else {
        ctx.fillStyle =
          getComputedStyle(document.documentElement).getPropertyValue('--color-bg-surface').trim() || '#f7f5f0';
        ctx.fillRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
      }
    }

    ctx.restore();
  };

  const drawBackground = (
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
  ) => {
    let progress = 1;
    if (isTransitioningBackground.value) {
      if (transitionStartTime === null) transitionStartTime = performance.now();
      const elapsed = performance.now() - transitionStartTime;
      const linear = Math.min(1, elapsed / TRANSITION_DURATION);
      progress = 1 - (1 - linear) * (1 - linear);
      if (progress >= 1) {
        isTransitioningBackground.value = false;
        transitionStartTime = null;
        prevBgState.value = null;
        prevBgImg.value = null;
      }
    }

    if (progress < 1 && prevBgState.value) {
      drawSingleBackground(ctx, prevBgState.value, prevBgImg.value, null, rect, 1.0);
      drawSingleBackground(ctx, activeBgState.value, activeBgImg.value, activeBgFrame.value, rect, progress);
    } else {
      drawSingleBackground(ctx, activeBgState.value, activeBgImg.value, activeBgFrame.value, rect, 1.0);
    }
  };

  const syncPlayback = (isPlaying: boolean) => {
    shouldPlay = isPlaying;
    const engine = backgroundEngine;
    if (!engine || engine.state === 'loading' || engine.state === 'idle') return;
    if (isPlaying && engine.state === 'paused') void engine.play(engine.currentTime);
    else if (!isPlaying) engine.pause();
  };

  return {
    drawBackground,
    syncPlayback,
    isTransitioningBackground,
    backgroundError,
  };
}
