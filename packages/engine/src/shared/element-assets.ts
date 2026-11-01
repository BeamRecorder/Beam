import type { ShapeClip } from './composition-types';
import type { ElementAsset } from './element-asset-types';
import { isShapeLayerStyle, normalizeShapeLayerStyle } from './shape-layer-style';

export const ELEMENT_ASSETS_KEY = 'elementAssets';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const dimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 65536;
export function isElementAsset(value: unknown): value is ElementAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Partial<ElementAsset>;
  try {
    return (
      typeof asset.id === 'string' &&
      asset.id.length > 0 &&
      asset.id.length <= 128 &&
      typeof asset.name === 'string' &&
      asset.name.trim().length > 0 &&
      asset.name.length <= 200 &&
      !!asset.size &&
      dimension(asset.size.width) &&
      dimension(asset.size.height) &&
      !!asset.style &&
      isShapeLayerStyle(asset.style)
    );
  } catch {
    return false;
  }
}
export function readElementAssets(value: unknown): ElementAsset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(isElementAsset)
    .filter((asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    })
    .map((asset) =>
      clone({
        id: asset.id,
        name: asset.name,
        style: normalizeShapeLayerStyle(asset.style),
        size: { width: asset.size.width, height: asset.size.height },
      }),
    );
}
export function saveElementAsset(clip: ShapeClip, canvas: { width: number; height: number }): ElementAsset {
  const asset = {
    id: crypto.randomUUID(),
    name: clip.name.trim().slice(0, 200),
    style: clone(normalizeShapeLayerStyle(clip)),
    size: { width: clip.transform.width * canvas.width, height: clip.transform.height * canvas.height },
  };
  if (!isElementAsset(asset)) throw new TypeError('Invalid element asset');
  return asset;
}
export function elementAssetTransform(asset: ElementAsset, canvas: { width: number; height: number }) {
  if (!isElementAsset(asset) || !dimension(canvas.width) || !dimension(canvas.height))
    throw new TypeError('Invalid element asset canvas');
  const scale = Math.min(1, (canvas.width * 0.8) / asset.size.width, (canvas.height * 0.8) / asset.size.height);
  const width = (asset.size.width * scale) / canvas.width,
    height = (asset.size.height * scale) / canvas.height;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
