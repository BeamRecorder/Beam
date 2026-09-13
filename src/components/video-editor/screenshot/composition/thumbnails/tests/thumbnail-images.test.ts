import { describe, expect, it } from 'vitest';
import type { ScreenshotState } from '~/api/types/screenshot';
import { screenshotState } from '../../../screenshot-state';
import { initializeScreenshotComposition } from '../../../screenshot-layers';
import { documentFixture } from '../../../tests/screenshot-editor-test-helpers';
import type { ScreenshotImageLayer } from '../../../screenshot-layer-types';
import { screenshotThumbnailSpecs } from '../thumbnail-spec';

const createState = () => {
  const state = screenshotState(documentFixture());
  const imported: ScreenshotImageLayer = {
    ...state.image,
    kind: 'image',
    id: 'imported-image',
    name: 'Reference image',
    assetId: 'reference-asset',
    source: 'project-media://screenshot/screen-1/reference.png',
    width: 800,
    height: 600,
    transform: { x: 0.18, y: 0.27, width: 0.52, height: 0.44 },
    appearance: { ...state.image.appearance, shadowBlur: 16 },
  };
  state.images = [imported];
  initializeScreenshotComposition(state);
  return { state, imported };
};

const importedSpec = (state: ScreenshotState) =>
  screenshotThumbnailSpecs(state, 'project-media://screenshot/screen-1/source.png', []).find(
    (spec) => spec.id === 'imported-image',
  );

describe('screenshot imported-image thumbnail specs', () => {
  it('uses the imported source and full visual clip as the worker image', () => {
    const { state, imported } = createState();
    const spec = importedSpec(state);

    expect(spec).toBeDefined();
    expect(spec!.layer).toMatchObject({ id: imported.id, kind: 'image', name: imported.name });
    expect(spec!.sourceUrl).toBe(imported.source);
    expect(spec!.state.image).toEqual(imported);
    expect(spec!.state.image.appearance).toEqual(imported.appearance);
    expect(spec!.state.images).toEqual([]);
  });

  it('keeps an isolated thumbnail key stable across position moves but invalidates visual changes', () => {
    const { state, imported } = createState();
    const initial = importedSpec(state)!;
    imported.transform = { ...imported.transform, x: 0.72, y: 0.61 };
    const moved = importedSpec(state)!;

    expect(moved.key).toBe(initial.key);
    expect(moved.state.image.transform).toEqual(imported.transform);

    imported.appearance = { ...imported.appearance, shadowBlur: 24 };
    const restyled = importedSpec(state)!;
    expect(restyled.key).not.toBe(initial.key);
    expect(restyled.state.image.appearance.shadowBlur).toBe(24);
  });
});
