import { createRenderDocument } from '@beam/engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { VisualClip, MediaAsset } from '@beam/engine/shared/composition-types';

export function htmlSceneFixture() {
  const document = createRenderDocument();
  const html = {
    version: 1 as const,
    id: 'html',
    revision: 'rev',
    entry: 'index.html',
    width: 1920,
    height: 1080,
    durationMs: 15000,
    fps: 30,
    framework: 'html' as const,
  };
  const asset: MediaAsset = {
    id: 'asset',
    kind: 'image' as const,
    origin: 'project' as const,
    name: 'HTML',
    src: 'preview.png',
    fileName: 'preview.png',
    width: 1920,
    height: 1080,
    durationMs: 0,
    html,
  };
  const clip: VisualClip = {
    id: 'clip',
    assetId: 'asset',
    kind: 'image' as const,
    name: 'HTML',
    timelineStartMs: 1000,
    timelineDurationMs: 15000,
    sourceInMs: 0,
    sourceDurationMs: 15000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: { ...createDefaultClipAppearance('image'), cornerRadius: 0, shadowSize: 'none' as const },
    isMirrored: false,
    isMirroredY: false,
  };
  document.composition.assets.push(asset);
  document.composition.clips.push(clip);
  return { document, composition: document.composition, canvas: document.canvas, clip, html, asset };
}
