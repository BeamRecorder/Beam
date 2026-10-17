import type { BlurClip, ClipComposition, ShapeClip, VisualClip } from '@beam/engine/shared/composition-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import { prepareClipTrimPreview } from '@beam/engine/composition/clip-trim-preview';
import frozen from '../assets/snapshot.json';
import video from '../assets/recording.mp4';
import logo from '../assets/beam-ending.png';
import golden from '../assets/golden-gate-4k.webp';
import ventura from '../assets/ventura.webp';
import light from '../assets/tahoe-light.webp';
import dark from '../assets/tahoe-dark.webp';
import sunset from '../assets/golden-gate-sunset.webp';
import night from '../assets/golden-gate-night.webp';
import font from '../assets/HankenGrotesk.ttf';
import {
  BLUR_START,
  SHAPE_START,
  NORMAL_BLUR_TIME,
  PIXELATED_TIME,
  SCRUB_TIME,
  blurAt,
  blurPercentAt,
  shapeAt,
  trimAt,
  wallpaperAt,
} from './motion';

export const ORIGINAL = frozen as unknown as CompositionSnapshot;
export const WALLPAPERS = [
  { id: 'golden', name: 'Golden Gate', url: golden },
  { id: 'ventura', name: 'Ventura', url: ventura },
  { id: 'light', name: 'Tahoe Light', url: light },
  { id: 'dark', name: 'Tahoe Dark', url: dark },
  { id: 'sunset', name: 'Golden Gate Sunset', url: sunset },
  { id: 'night', name: 'Golden Gate Night', url: night },
];
export const VIDEO_URL = video;
export const LOGO_URL = logo;
export const FONT_URL = font;
const cursorUrls = import.meta.glob('../assets/cursors/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
export const CURSOR_URLS = new Map(
  Object.entries(cursorUrls).map(([path, url]) => [path.split('/').at(-1)!.replace('.svg', ''), url]),
);
export const BASE: CompositionSnapshot = {
  ...ORIGINAL,
  composition: {
    ...ORIGINAL.composition,
    assets: ORIGINAL.composition.assets.map((asset) => ({ ...asset, src: asset.kind === 'video' ? video : logo })),
  },
  cursorPack: ORIGINAL.cursorPack && {
    ...ORIGINAL.cursorPack,
    cursors: ORIGINAL.cursorPack.cursors.map((cursor) => ({ ...cursor, url: CURSOR_URLS.get(cursor.id)! })),
  },
  cursor: {
    ...ORIGINAL.cursor,
    hoverSources: ORIGINAL.cursor.hoverSources?.map((source) => ({ ...source, src: video })),
  },
  background: { kind: 'image', src: golden },
  fontSources: Object.fromEntries(Object.keys(ORIGINAL.fontSources ?? {}).map((id) => [id, font])),
};
export const SCREEN = BASE.composition.clips.find((clip): clip is VisualClip => clip.kind === 'screen')!;
const trimPreview = prepareClipTrimPreview(BASE.composition, SCREEN.id, 'end');
const common = {
  enabled: true,
  timelineStartMs: 0,
  timelineDurationMs: 19000,
  sourceInMs: 0,
  sourceDurationMs: 19000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  assetId: '',
};
export function shapeClip(time: number): ShapeClip {
  const p = shapeAt(time);
  return {
    ...common,
    ...DEFAULT_ANNOTATION_SHAPE_STYLE,
    id: 'film-rectangle',
    name: 'Rectangle',
    kind: 'shape',
    trackId: 'film-rectangle-track',
    order: 1,
    fillEnabled: true,
    borderWidth: 0,
    transform: { x: 0.43, y: 0.39, width: Math.max(0.001, 0.17 * p), height: Math.max(0.001, 0.16 * p) },
  };
}
export function blurClip(time: number): BlurClip {
  const p = blurAt(time);
  return {
    ...common,
    id: 'film-blur',
    name: 'Privacy blur',
    kind: 'blur',
    trackId: 'film-blur-track',
    order: 0,
    shape: 'rectangle',
    mode: time >= PIXELATED_TIME && time < NORMAL_BLUR_TIME ? 'pixelated' : 'blur',
    strength: 65,
    feather: 8,
    cornerRadius: 8,
    tintOpacity: 0,
    color: '#111111',
    transform: { x: 0.42, y: 0.3, width: Math.max(0.001, 0.25 * p), height: Math.max(0.001, 0.085 * p) },
  };
}
export function compositionAt(time: number): ClipComposition {
  const trimmed = trimPreview(
    SCREEN.timelineStartMs + SCREEN.timelineDurationMs - Math.round(1200 * trimAt(time)),
  ).composition;
  return {
    ...trimmed,
    clips: [
      ...trimmed.clips.map((clip) => ({ ...clip, order: clip.order + 2 })),
      ...(time >= SHAPE_START ? [shapeClip(time)] : []),
      ...(time >= BLUR_START ? [blurClip(time)] : []),
    ],
  };
}
export function snapshotAt(time: number): CompositionSnapshot {
  return {
    ...BASE,
    composition: compositionAt(time),
    background: { kind: 'image', src: WALLPAPERS.find((wallpaper) => wallpaper.id === wallpaperAt(time))!.url },
    blurPercent: blurPercentAt(time),
    // The edit pointer is separate from the pointer baked into the preview's recording.
    cursorSettings: { ...BASE.cursorSettings, enabled: time < SCRUB_TIME && BASE.cursorSettings.enabled },
  };
}
