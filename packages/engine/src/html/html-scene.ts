import { createCompositionSceneLayerResolver } from '@beam/engine/composition/scene-layers';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { HtmlSceneSource } from './html-types';

/** A complete HTML scene can be presented by Chromium without flattening it into pixels. */
export function createHtmlSceneResolver(composition: ClipComposition) {
  const layersAt = createCompositionSceneLayerResolver(composition);
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const previews = new Map<string, HtmlSceneSource>();
  return (timeMs: number, canvas: OutputCanvasSettings, hasCameraEffects: boolean): HtmlSceneSource | null => {
    if (
      hasCameraEffects ||
      composition.scene ||
      composition.animations?.tracks.length ||
      canvas.watermark?.enabled ||
      canvas.transitions?.entry ||
      canvas.transitions?.exit
    )
      return null;
    const layers = layersAt(timeMs);
    if (layers.visualStack.length !== 1 || layers.captions.length) return null;
    const clip = layers.cameraVisuals[0];
    if (
      !clip ||
      clip.kind !== 'image' ||
      clip.rotation ||
      clip.isMirrored ||
      clip.isMirroredY ||
      clip.transitions?.entry ||
      clip.transitions?.exit
    )
      return null;
    const { x, y, width, height } = clip.transform;
    const appearance = clip.appearance,
      crop = clip.crop;
    if (
      x !== 0 ||
      y !== 0 ||
      width !== 1 ||
      height !== 1 ||
      appearance.frame !== 'none' ||
      (appearance.cornerRadius !== 0 && appearance.cornerRadius !== 'none') ||
      appearance.shadowSize !== 'none' ||
      appearance.borderEnabled ||
      (crop && (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1))
    )
      return null;
    const asset = assets.get(clip.assetId),
      html = asset?.html;
    if (!asset || !html || html.durationMs === 0 || html.width * canvas.height !== html.height * canvas.width)
      return null;
    let preview = previews.get(clip.id);
    if (!preview) previews.set(clip.id, (preview = { clip, asset, html }));
    return preview;
  };
}
