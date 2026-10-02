import { describe, expect, it } from 'vitest';
import { activeZoomTiltPreset, applyZoomTiltPreset, ZOOM_TILT_PRESETS } from '@beam/engine/zoom/zoom-tilt-presets';
import { normalizeZoomTiltPreset, type ZoomElement } from '@beam/engine/zoom/zoom-types';

const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'session',
  startMs: 100,
  endMs: 1200,
  focus: { cx: 0.3, cy: 0.6 },
  mode: 'manual',
  depth: 4,
};

describe('directional tilt presets', () => {
  it.each(ZOOM_TILT_PRESETS)('applies and restores $id without changing framing or timing', (preset) => {
    const result = applyZoomTiltPreset(zoom, preset);
    expect(result).toMatchObject({ ...zoom, projection: '3d', tiltPreset: preset.id });
    expect(activeZoomTiltPreset(result)).toBe(preset.id);
    expect(normalizeZoomTiltPreset(preset.id, preset.intensity)).toBe(preset.id);
    expect(result).not.toBe(zoom);
    expect(zoom.tiltPreset).toBeUndefined();
    for (const field of ['tiltIntensity', 'tiltHorizontal', 'tiltVertical'] as const) {
      expect(Number.isFinite(result[field])).toBe(true);
      expect(Math.abs(result[field]!)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps explicitly custom values custom even when they match a preset', () => {
    expect(activeZoomTiltPreset({ ...applyZoomTiltPreset(zoom, ZOOM_TILT_PRESETS[0]!), tiltPreset: 'custom' })).toBe(
      'custom',
    );
  });

  it('recognizes legacy default angles without rewriting them', () => {
    expect(activeZoomTiltPreset(zoom)).toBe('pull-front');
    expect(activeZoomTiltPreset({ ...zoom, tiltPreset: 'medium' })).toBe('pull-front');
    expect(activeZoomTiltPreset({ ...zoom, tiltPreset: 'small', tiltIntensity: 0.3 })).toBe('custom');
    expect(normalizeZoomTiltPreset('small', 0.3)).toBe('small');
    expect(normalizeZoomTiltPreset(undefined, 0.6)).toBe('medium');
  });

  it('shows custom for mismatched preset metadata or modified controls', () => {
    const preset = applyZoomTiltPreset(zoom, ZOOM_TILT_PRESETS[0]!);
    expect(activeZoomTiltPreset({ ...preset, tiltPreset: 'tilt-front' })).toBe('custom');
    expect(activeZoomTiltPreset({ ...preset, tiltHorizontal: 0.1 })).toBe('custom');
    expect(activeZoomTiltPreset({ ...preset, tiltVertical: 0.4 })).toBe('custom');
    expect(activeZoomTiltPreset({ ...preset, tiltIntensity: 0.4 })).toBe('custom');
    expect(activeZoomTiltPreset({ ...preset, tiltIntensity: NaN })).toBe('tilt-back');
  });

  it('keeps all six directions distinct and mirrored as advertised', () => {
    expect(new Set(ZOOM_TILT_PRESETS.map((preset) => `${preset.horizontal},${preset.vertical}`)).size).toBe(6);
    for (const [a, b] of [
      [0, 1],
      [2, 3],
      [4, 5],
    ]) {
      expect(ZOOM_TILT_PRESETS[a!]!.horizontal + ZOOM_TILT_PRESETS[b!]!.horizontal).toBe(0);
      expect(ZOOM_TILT_PRESETS[a!]!.vertical + ZOOM_TILT_PRESETS[b!]!.vertical).toBe(0);
    }
  });
});
