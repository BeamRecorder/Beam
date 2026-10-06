import { describe, it, expect } from 'vitest';
import { previewClip, zoomElements, selectedZoom } from '../src/scene-model';
import { createCompositionCameraEvaluator } from '../../../packages/engine/src/zoom/composition-camera';
import { activeZoomTiltPreset } from '../../../packages/engine/src/zoom/zoom-tilt-presets';
describe('native zoom scene', () => {
  it('retains the real capture and timing', () => {
    expect(previewClip()).toMatchObject({ assetId: 'capture', kind: 'image', enabled: true, timelineDurationMs: 8000 });
    expect(previewClip()).not.toBe(previewClip());
    expect(previewClip().transform).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('keeps 2D and 3D scenes independent', () => {
    const two = zoomElements('2d'),
      three = zoomElements('3d');
    expect(two.every((zoom) => zoom.projection === '2d')).toBe(true);
    expect(three.every((zoom) => zoom.projection === '3d')).toBe(true);
    expect(three.map(activeZoomTiltPreset)).toEqual(['tilt-left', 'pull-front']);
    three[0]!.focus.cx = 0;
    expect(zoomElements('3d')[0]!.focus.cx).toBe(0.5);
  });
  it('changes inspector selection at the click and resets', () => {
    for (const mode of ['2d', '3d'] as const) {
      expect(selectedZoom(mode, 3.399).id).toBe('first-zoom');
      expect(selectedZoom(mode, 3.4).id).toBe('second-zoom');
      expect(selectedZoom(mode, 8).id).toBe('first-zoom');
    }
    expect(activeZoomTiltPreset(selectedZoom('3d', 0.799))).toBe('tilt-back');
    expect(activeZoomTiltPreset(selectedZoom('3d', 0.8))).toBe('tilt-left');
    expect(activeZoomTiltPreset(selectedZoom('3d', 8))).toBe('tilt-back');
  });
  it('renders actual 2D movement without perspective', () => {
    const camera = createCompositionCameraEvaluator({ zooms: zoomElements('2d'), telemetry: [] });
    expect(camera.sample(2100).scale).toBeGreaterThan(1.6);
    expect(camera.sample(4500).focus.cx).toBeLessThan(camera.sample(2100).focus.cx);
    expect(camera.sample(4500).tiltX).toBe(0);
  });
  it('renders visible opposing 3D tilts and can seek backwards', () => {
    const camera = createCompositionCameraEvaluator({ zooms: zoomElements('3d'), telemetry: [] });
    const left = camera.sample(2500),
      right = camera.sample(4500);
    expect(left.tiltY).toBeLessThan(-0.45);
    expect(right.tiltY).toBeGreaterThan(0.2);
    expect(camera.sample(2500)).toEqual(left);
    expect(camera.sample(0)).toMatchObject({ scale: 1, tiltX: 0, tiltY: 0 });
  });
});
