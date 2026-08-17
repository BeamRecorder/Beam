import { describe, expect, it, vi } from 'vitest';
import {
  computeWebcamLayout,
  drawWebcamOverlay,
  getWebcamZoomFactor,
  normalizeWebcamTransformToVisibleFraming,
  webcamSettingsForAppearance,
} from '../webcam/webcam-zoom';
import { resolveCameraFraming } from '../camera-layout';

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineCap: 'round',
    lineJoin: 'round',
  }) as unknown as CanvasRenderingContext2D;

describe('webcam zoom layout', () => {
  it('uses the inverse of the applied zoom scale', () => {
    expect(getWebcamZoomFactor(1, true)).toBe(1);
    expect(getWebcamZoomFactor(1.5, true)).toBeCloseTo(2 / 3);
    expect(getWebcamZoomFactor(3.5, true)).toBeCloseTo(1 / 3.5);
  });

  it('does not react when the setting is disabled or the scale is invalid', () => {
    expect(getWebcamZoomFactor(3, false)).toBe(1);
    expect(getWebcamZoomFactor(0, true)).toBe(1);
    expect(getWebcamZoomFactor(Number.NaN, true)).toBe(1);
  });

  it('turns an inset squircle frame into the editable camera transform without moving it', () => {
    const settings = webcamSettingsForAppearance(undefined);
    const original = { x: 0.68, y: 0.68, width: 0.28, height: 0.28 };
    const beforeLayout = computeWebcamLayout(800, 450, 1, settings, original);
    const beforeFrame = resolveCameraFraming('squircle', beforeLayout, 1280, 720).rect;

    const editable = normalizeWebcamTransformToVisibleFraming(800, 450, 1, settings, original, 'squircle', 1280, 720);
    const afterLayout = computeWebcamLayout(800, 450, 1, settings, editable);
    const afterFrame = resolveCameraFraming('squircle', afterLayout, 1280, 720).rect;

    expect(editable.width).toBeCloseTo(0.1575);
    expect(editable.height).toBeCloseTo(0.28);
    expect(afterFrame).toEqual(beforeFrame);
  });

  it('preserves the currently visible framed rectangle while automatic zoom is active', () => {
    const settings = webcamSettingsForAppearance(undefined);
    const original = { x: 0.68, y: 0.68, width: 0.28, height: 0.28 };
    const beforeLayout = computeWebcamLayout(800, 450, 2, settings, original);
    const beforeFrame = resolveCameraFraming('squircle', beforeLayout, 1280, 720).rect;

    const editable = normalizeWebcamTransformToVisibleFraming(800, 450, 2, settings, original, 'squircle', 1280, 720);
    const afterLayout = computeWebcamLayout(800, 450, 2, settings, editable);
    const afterFrame = resolveCameraFraming('squircle', afterLayout, 1280, 720).rect;

    expect(afterFrame.x).toBeCloseTo(beforeFrame.x);
    expect(afterFrame.y).toBeCloseTo(beforeFrame.y);
    expect(afterFrame.width).toBeCloseTo(beforeFrame.width);
    expect(afterFrame.height).toBeCloseTo(beforeFrame.height);
  });

  it('keeps fill framing unchanged while clamping malformed persisted bounds', () => {
    expect(
      normalizeWebcamTransformToVisibleFraming(
        800,
        450,
        1,
        webcamSettingsForAppearance(undefined),
        { x: 0.9, y: -0.2, width: 0.5, height: 1.4 },
        'fill',
        1280,
        720,
      ),
    ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 });
  });

  it('keeps the webcam pinned to the bottom right as its size changes', () => {
    const normal = computeWebcamLayout(1000, 800, 1);
    const zoomed = computeWebcamLayout(1000, 800, 2);
    expect(zoomed.width).toBeCloseTo(normal.width / 2);
    expect(zoomed.height).toBeCloseTo(normal.height / 2);
    expect(zoomed.x + zoomed.width).toBeCloseTo(normal.x + normal.width);
    expect(zoomed.y + zoomed.height).toBeCloseTo(normal.y + normal.height);
  });

  it('enforces the minimum overlay size on a heavily zoomed small canvas', () => {
    const layout = computeWebcamLayout(80, 80, 20);
    expect(layout.width).toBe(56);
    expect(layout.height).toBe(56);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.y).toBeGreaterThanOrEqual(0);
  });

  it('clamps a persisted overlay that would extend beyond the frame', () => {
    const layout = computeWebcamLayout(1000, 800, 1, undefined, { x: 0.9, y: 0.9, width: 0.5, height: 0.4 });
    expect(layout.x).toBe(500);
    expect(layout.y).toBe(480);
    expect(layout.x + layout.width).toBe(1000);
    expect(layout.y + layout.height).toBe(800);
  });

  it('uses the persisted normalized position and size for a webcam', () => {
    const layout = computeWebcamLayout(1000, 800, 1, undefined, { x: 0.12, y: 0.34, width: 0.28, height: 0.21 });
    expect(layout.x).toBeCloseTo(120);
    expect(layout.y).toBeCloseTo(272);
    expect(layout.width).toBeCloseTo(280);
    expect(layout.height).toBeCloseTo(168);
  });

  it("preserves a persisted webcam's right and bottom offsets while zooming", () => {
    const transform = { x: 0.56, y: 0.62, width: 0.28, height: 0.21 };
    const normal = computeWebcamLayout(1000, 800, 1, undefined, transform);
    const zoomed = computeWebcamLayout(1000, 800, 2, undefined, transform);
    expect(zoomed.x + zoomed.width).toBeCloseTo(normal.x + normal.width);
    expect(zoomed.y + zoomed.height).toBeCloseTo(normal.y + normal.height);
  });

  it('maps every recorded visual preset to deterministic canvas settings', () => {
    expect(
      webcamSettingsForAppearance({ shadowSize: 'none', shadowBlur: 0, shadowMode: 'solid', cornerRadius: 'none' }),
    ).toMatchObject({
      shadowOpacity: 0,
      cornerRadius: 0,
    });
    expect(
      webcamSettingsForAppearance({ shadowSize: 'md', shadowBlur: 12, shadowMode: 'solid', cornerRadius: 'md' }),
    ).toMatchObject({
      shadowOpacity: 0.42,
      cornerRadius: 14,
    });
    const full = webcamSettingsForAppearance(
      { shadowSize: 'lg', shadowBlur: 20, shadowMode: 'solid', cornerRadius: 'full' },
      false,
      true,
    );
    expect(full.shadowOpacity).toBe(0.58);
    expect(full.cornerRadius).toBeGreaterThan(1_000_000);
    expect(full.mirror).toBe(false);
    expect(full.mirrorY).toBe(true);
  });

  it('uses frame dimensions for crop and preserves both mirror axes', () => {
    const ctx = context();
    const source = {} as CanvasImageSource;
    drawWebcamOverlay(
      ctx,
      source,
      { width: 320, height: 240 },
      1000,
      800,
      1,
      webcamSettingsForAppearance(
        { shadowSize: 'none', shadowBlur: 0, shadowMode: 'solid', cornerRadius: 'none' },
        true,
        true,
      ),
      { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
      { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    );
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 32, 24, 256, 192, 100, 160, 400, 240);
    expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
  });
});
