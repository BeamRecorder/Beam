import { renderBackground } from '../../../packages/runtime/src/composition/background/render-background';
import {
  drawDecoratedMedia,
  DEFAULT_CLIP_APPEARANCE,
} from '../../../packages/runtime/src/composition/appearance/render-decorated-media';
import { resolveSafariFrameGeometry } from '../../../packages/engine/src/layout/frame-geometry';
import { COLORS, GRADIENTS } from './catalog';
import { INITIAL_ID, stateAt } from './motion';
import type { BackgroundSelection } from './demo-types';

export function paintPreview(
  context: CanvasRenderingContext2D,
  time: number,
  images: Map<string, HTMLImageElement>,
  artwork: HTMLImageElement,
  video: CanvasImageSource | undefined,
  dark: boolean,
) {
  const { width, height } = context.canvas;
  const rect = { x: 0, y: 0, width, height };
  const state = stateAt(time);
  context.clearRect(0, 0, width, height);
  const background = (step: BackgroundSelection, alpha: number) => {
    if (alpha <= 0) return;
    const value =
      step.kind === 'color'
        ? COLORS.find((item) => item.id === step.id)!
        : step.kind === 'gradient'
          ? GRADIENTS.find((item) => item.id === step.id)!
          : { kind: step.kind };
    renderBackground(context, {
      value,
      source: step.kind === 'video' ? video : images.get(step.id),
      rect,
      blurPixels: 0,
      alpha,
    });
  };
  background(state.previous, 1);
  background(state.current, state.transition);
  if (state.restore > 0) background({ ...state.current, id: INITIAL_ID, kind: 'image' }, state.restore);
  const mediaWidth = width * 0.8;
  const header = resolveSafariFrameGeometry({
    x: 0,
    y: 0,
    width: mediaWidth,
    height,
  }).header;
  const mediaHeight = (mediaWidth * artwork.naturalHeight) / artwork.naturalWidth + header;
  drawDecoratedMedia(context, {
    source: artwork,
    sourceRect: {
      x: 0,
      y: 0,
      width: artwork.naturalWidth,
      height: artwork.naturalHeight,
    },
    rect: {
      x: (width - mediaWidth) / 2,
      y: (height - mediaHeight) / 2,
      width: mediaWidth,
      height: mediaHeight,
    },
    appearance: {
      ...DEFAULT_CLIP_APPEARANCE,
      frame: 'safari',
      frameTitle: 'beam.place',
      frameColor: dark ? '#252527' : '#f6f6f7',
      frameTheme: dark ? 'dark' : 'light',
      cornerRadius: 16,
      shadowSize: 'md',
    },
    shadowScale: 0.65,
    title: 'Beautiful Captures',
  });
}
