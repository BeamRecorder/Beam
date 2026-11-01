import type { ElementAsset } from '@beam/engine/shared/element-asset-types';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import { elementAssetTransform } from '@beam/engine/shared/element-assets';

/** Render the saved artwork at the same size and canvas scale as a new insertion. */
export function elementAssetPreviewClip(
  asset: ElementAsset,
  canvas: Pick<OutputCanvasSettings, 'width' | 'height'>,
): ShapeClip {
  return {
    ...asset.style,
    id: asset.id,
    trackId: asset.id,
    name: asset.name,
    kind: 'shape',
    assetId: '',
    enabled: true,
    order: 0,
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    transform: elementAssetTransform(asset, canvas),
  };
}
