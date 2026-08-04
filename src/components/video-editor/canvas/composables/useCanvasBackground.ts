import { ref, watch, onUnmounted } from 'vue';
import type { BackgroundValue } from '../../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

export function useCanvasBackground(
  selectedBackground: () => BackgroundValue | null,
  backgroundBlurPercent: () => number | undefined,
  renderCanvas: () => void,
) {
  const activeBgState = ref<BackgroundValue | null>(null);
  const activeBgImg = ref<HTMLImageElement | null>(null);
  const prevBgState = ref<BackgroundValue | null>(null);
  const prevBgImg = ref<HTMLImageElement | null>(null);
  const isTransitioningBackground = ref(false);
  let transitionStartTime: number | null = null;
  const TRANSITION_DURATION = 180;

  const backgroundVideo = document.createElement('video');
  backgroundVideo.autoplay = true;
  backgroundVideo.loop = true;
  backgroundVideo.muted = true;
  backgroundVideo.playsInline = true;

  const bgImageCache = new Map<string, HTMLImageElement>();
  let backgroundLoadVersion = 0;

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

  const loadBackground = () => {
    const nextBg = selectedBackground();
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
      const loadVersion = ++backgroundLoadVersion;
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
      prevBgState.value = activeBgState.value;
      prevBgImg.value = activeBgImg.value;
      activeBgState.value = nextBg;
      backgroundVideo.src = resolvePublicAssetUrl(nextBg.path);
      backgroundVideo.load();
      activeBgImg.value = null;
      triggerBgTransition();
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

  backgroundVideo.addEventListener('loadeddata', renderCanvas);
  watch(selectedBackground, loadBackground, { immediate: true, deep: true });
  watch(backgroundBlurPercent, renderCanvas);

  onUnmounted(() => {
    backgroundVideo.pause();
    backgroundVideo.removeEventListener('loadeddata', renderCanvas);
  });

  const drawSingleBackground = (
    ctx: CanvasRenderingContext2D,
    bg: BackgroundValue | null,
    imgSource: HTMLImageElement | null,
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
      const source =
        bg.kind === 'video' && backgroundVideo.readyState >= 2
          ? backgroundVideo
          : bg.kind === 'image' && imgSource && imgSource.naturalWidth > 0
            ? imgSource
            : null;

      if (source) {
        const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
        const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
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
      drawSingleBackground(ctx, prevBgState.value, prevBgImg.value, rect, 1.0);
      drawSingleBackground(ctx, activeBgState.value, activeBgImg.value, rect, progress);
    } else {
      drawSingleBackground(ctx, activeBgState.value, activeBgImg.value, rect, 1.0);
    }
  };

  const syncVideoPlayback = (isPlaying: boolean) => {
    if (isPlaying && selectedBackground()?.kind === 'video') {
      backgroundVideo.play().catch((error) => console.error('Failed to play background video:', error));
    } else {
      backgroundVideo.pause();
    }
  };

  return {
    drawBackground,
    syncVideoPlayback,
    isTransitioningBackground,
  };
}
