import { createCompositionCameraEvaluator } from '../../../packages/engine/src/zoom/composition-camera';
import { renderPerspectiveLayers } from '../../../packages/runtime/src/rendering/perspective-render';
import { drawDecoratedMedia } from '../../../packages/runtime/src/composition/appearance/render-decorated-media';
import { phaseTime } from './motion';
import { zoomElements, previewClip } from './scene-model';
import type { DemoMode } from './demo-types';

const cameras = {
  '2d': createCompositionCameraEvaluator({ zooms: zoomElements('2d'), telemetry: [] }),
  '3d': createCompositionCameraEvaluator({ zooms: zoomElements('3d'), telemetry: [] }),
};
export function paintPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, mode: DemoMode, time: number) {
  const context = canvas.getContext('2d')!,
    { width, height } = canvas;
  const camera = cameras[mode].sample(phaseTime(time) * 1000);
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(canvas).getPropertyValue('--color-bg-well');
  context.fillRect(0, 0, width, height);
  const draw = (target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    target.save();
    target.translate(width / 2, height / 2);
    target.scale(camera.scale, camera.scale);
    target.translate(-camera.focus.cx * width, -camera.focus.cy * height);
    if (mode === '3d') {
      const dark = document.documentElement.dataset.demoTheme === 'dark';
      drawDecoratedMedia(target, {
        source: image,
        title: 'Beam — Beautiful Captures',
        rect: { x: width * 0.315, y: height * 0.315, width: width * 0.37, height: height * 0.37 },
        appearance: {
          ...previewClip().appearance,
          frame: 'safari',
          frameTitle: 'beam.plinka.eu',
          frameColor: dark ? '#29292d' : '#f0f0f2',
          frameTheme: dark ? 'dark' : 'light',
          cornerRadius: 16,
          shadowSize: 'lg',
        },
      });
    } else target.drawImage(image, 0, 0, width, height);
    target.restore();
  };
  renderPerspectiveLayers({
    target: context,
    width,
    height,
    transform: { tiltX: camera.tiltX ?? 0, tiltY: camera.tiltY ?? 0 },
    drawLayers: draw,
  });
}
