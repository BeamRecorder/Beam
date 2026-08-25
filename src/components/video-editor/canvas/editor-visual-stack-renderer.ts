import type { CompositionSceneLayers } from '../composition/scene-layers';
import type { useCompositionMedia } from './composables/useCompositionMedia';
import type { RenderedVideoWindow } from './composables/useCameraZoom';

export function createEditorVisualStackRenderer(compositionMedia: ReturnType<typeof useCompositionMedia>) {
  const drawNonScreenVisuals = (
    context: CanvasRenderingContext2D,
    window: RenderedVideoWindow,
    layers: CompositionSceneLayers,
  ) => {
    if (compositionMedia.drawVisualStack) compositionMedia.drawVisualStack(context, window, () => undefined, layers);
    else compositionMedia.drawWebcamClips(context, window);
  };
  const drawVisualStack = (
    context: CanvasRenderingContext2D,
    window: RenderedVideoWindow,
    drawScreen: () => void,
    layers: CompositionSceneLayers,
  ) => {
    if (compositionMedia.drawVisualStack) {
      compositionMedia.drawVisualStack(context, window, drawScreen, layers);
      return;
    }
    for (const clip of layers.cameraVisuals) {
      if (clip.kind === 'screen') drawScreen();
      else compositionMedia.drawComposition(context, window, clip.id);
    }
  };
  return { drawNonScreenVisuals, drawVisualStack };
}
