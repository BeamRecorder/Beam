import wallpapers from 'virtual:public-background-media';
import { tNamespace } from '~/i18n';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const $t = tNamespace('backgroundCatalog');

export type BackgroundKind = 'image' | 'video' | 'color' | 'gradient';
export type BackgroundMediaKind = Extract<BackgroundKind, 'image' | 'video'>;

export interface GradientStop {
  id: string;
  position: number;
  color: string;
  alpha: number;
}
export interface GradientBackground {
  type: 'linear' | 'radial';
  angle: number;
  stops: GradientStop[];
}
export interface BackgroundMedia {
  id: string;
  name: string;
  path: string;
  extension: string;
  kind: BackgroundMediaKind;
  fileName?: string;
}
export interface ColorBackground {
  id: string;
  name: string;
  kind: 'color';
  color: string;
}
export interface GradientCatalogBackground {
  id: string;
  name: string;
  kind: 'gradient';
  gradient: GradientBackground;
}
export type BackgroundEntry = BackgroundMedia | ColorBackground | GradientCatalogBackground;
export type BackgroundValue = BackgroundMedia | ColorBackground | GradientCatalogBackground;
export interface BackgroundMediaGroup {
  kind: BackgroundMediaKind;
  label: string;
  items: BackgroundMedia[];
}

const mediaKinds: Record<string, BackgroundMediaKind> = {
  avif: 'image',
  bmp: 'image',
  jpeg: 'image',
  jpg: 'image',
  png: 'image',
  webp: 'image',
  m4v: 'video',
  mov: 'video',
  mp4: 'video',
  ogv: 'video',
  webm: 'video',
};
const labels: Record<BackgroundMediaKind, string> = { image: $t('images'), video: $t('videos') };
const defaultGradient: GradientBackground = {
  type: 'linear',
  angle: 135,
  stops: [
    { id: 'start', position: 0, color: '#4f46e5', alpha: 1 },
    { id: 'end', position: 1, color: '#ec4899', alpha: 1 },
  ],
};

const extensionFor = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase();
const nameFor = (path: string) =>
  path
    .slice(path.lastIndexOf('/') + 1)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

const normalizeWallpaperPath = (path: string): string => {
  if (typeof path === 'string' && path.includes('wallpapers/image/')) {
    return path.replace(/\.(avif|jpg|jpeg|png)$/i, '.webp');
  }
  return path;
};

export const backgroundKindFor = (path: string): BackgroundMediaKind | null => mediaKinds[extensionFor(path)] ?? null;
export const createBackgroundMedia = (paths: readonly string[]): BackgroundMedia[] =>
  [...new Set(paths.map(normalizeWallpaperPath))]
    .flatMap((path) => {
      const kind = backgroundKindFor(path);
      if (!kind) return [];
      const resolved = resolvePublicAssetUrl(path);
      return [{ id: resolved, name: nameFor(path), path: resolved, extension: extensionFor(path), kind }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));

const mediaForKind = (paths: readonly string[], kind: BackgroundMediaKind) => {
  const root = `wallpapers/${kind}/`;
  return createBackgroundMedia(paths).filter((item) => item.kind === kind && item.path.includes(root));
};

/** Built-in wallpapers are deliberately sourced from their matching folder only. */
export const createWallpaperMedia = (imagePaths: readonly string[], videoPaths: readonly string[]): BackgroundMedia[] =>
  [...mediaForKind(imagePaths, 'image'), ...mediaForKind(videoPaths, 'video')].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
export const groupBackgroundMedia = (media: readonly BackgroundMedia[]): BackgroundMediaGroup[] =>
  (Object.keys(labels) as BackgroundMediaKind[])
    .map((kind) => ({ kind, label: labels[kind], items: media.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);

export const normalizeGradient = (value: unknown): GradientBackground => {
  const candidate = value && typeof value === 'object' ? (value as Partial<GradientBackground>) : {};
  const rawStops = Array.isArray(candidate.stops) ? candidate.stops : defaultGradient.stops;
  const stops = rawStops
    .map((stop, index) => {
      const item = stop as Partial<GradientStop>;
      const position = Number(item.position);
      return {
        id: typeof item.id === 'string' && item.id ? item.id : `stop-${index}`,
        position: clamp(Number.isFinite(position) ? position : index / Math.max(1, rawStops.length - 1)),
        color: hex(item.color) ? item.color : '#ffffff',
        alpha: clamp(Number.isFinite(Number(item.alpha)) ? Number(item.alpha) : 1),
      };
    })
    .sort((a, b) => a.position - b.position);
  return {
    type: candidate.type === 'radial' ? 'radial' : 'linear',
    angle: Number.isFinite(Number(candidate.angle))
      ? ((Number(candidate.angle) % 360) + 360) % 360
      : defaultGradient.angle,
    stops: stops.length >= 2 ? stops : structuredClone(defaultGradient.stops),
  };
};
export const BACKGROUND_MEDIA = createWallpaperMedia(wallpapers.images, wallpapers.videos);

export const findMatchingBackgroundMedia = (
  candidates: readonly BackgroundMedia[],
  idOrPath: string | null | undefined,
): BackgroundMedia | null => {
  if (!idOrPath) return null;
  const resolved = resolvePublicAssetUrl(idOrPath);

  const exact = candidates.find(
    (item) => item.id === idOrPath || item.path === idOrPath || item.id === resolved || item.path === resolved,
  );
  if (exact) return exact;

  const legacyReplaced = resolved.replace(/\.(avif|jpg|jpeg|png)$/i, '.webp');
  const extensionMatch = candidates.find((item) => item.id === legacyReplaced || item.path === legacyReplaced);
  if (extensionMatch) return extensionMatch;

  const baseName = idOrPath.slice(idOrPath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  const baseMatch = candidates.find((item) => {
    const itemBase = item.path.slice(item.path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    return itemBase.toLowerCase() === baseName.toLowerCase();
  });
  return baseMatch ?? null;
};

export const normalizeBackgroundValue = (value: unknown): BackgroundValue | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<BackgroundEntry>;
  if (
    (entry.kind === 'image' || entry.kind === 'video') &&
    (typeof entry.path === 'string' || typeof entry.id === 'string')
  ) {
    const matchedBuiltIn =
      findMatchingBackgroundMedia(BACKGROUND_MEDIA, entry.path) ??
      findMatchingBackgroundMedia(BACKGROUND_MEDIA, entry.id);
    if (matchedBuiltIn) return matchedBuiltIn;

    if (typeof entry.path === 'string' && backgroundKindFor(entry.path) === entry.kind) {
      const resolved = resolvePublicAssetUrl(entry.path);
      return {
        id: typeof entry.id === 'string' ? entry.id : resolved,
        name: typeof entry.name === 'string' ? entry.name : nameFor(entry.path),
        path: resolved,
        extension: extensionFor(entry.path),
        kind: entry.kind,
        ...(typeof entry.fileName === 'string' ? { fileName: entry.fileName } : {}),
      };
    }
  }
  if (entry.kind === 'color' && hex(entry.color))
    return {
      id: typeof entry.id === 'string' ? entry.id : `color:${entry.color.toLowerCase()}`,
      name: typeof entry.name === 'string' ? entry.name : entry.color,
      kind: 'color',
      color: entry.color,
    };
  if (entry.kind === 'gradient')
    return {
      id: typeof entry.id === 'string' ? entry.id : 'gradient:custom',
      name: typeof entry.name === 'string' ? entry.name : $t('customGradient'),
      kind: 'gradient',
      gradient: normalizeGradient(entry.gradient),
    };
  return null;
};

export const BACKGROUND_COLORS: ColorBackground[] = [
  '#111827',
  '#ffffff',
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#be123c',
].map((color) => ({ id: `color:${color}`, name: color, kind: 'color', color }));
export const BACKGROUND_GRADIENTS: GradientCatalogBackground[] = [
  { id: 'gradient:violet', name: $t('violet'), kind: 'gradient', gradient: defaultGradient },
  {
    id: 'gradient:fire',
    name: $t('fire'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'f1', position: 0, color: '#000000', alpha: 1 },
        { id: 'f2', position: 0.2, color: '#ff4500', alpha: 1 },
        { id: 'f3', position: 0.5, color: '#ff8c00', alpha: 1 },
        { id: 'f4', position: 1, color: '#ffff00', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:ocean',
    name: $t('ocean'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 120,
      stops: [
        { id: 'o1', position: 0, color: '#001219', alpha: 1 },
        { id: 'o2', position: 0.4, color: '#005f73', alpha: 1 },
        { id: 'o3', position: 0.7, color: '#0a9396', alpha: 1 },
        { id: 'o4', position: 1, color: '#94d2bd', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:sunset',
    name: $t('sunset'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 's1', position: 0, color: '#312244', alpha: 1 },
        { id: 's2', position: 0.3, color: '#d90429', alpha: 1 },
        { id: 's3', position: 0.6, color: '#f72585', alpha: 1 },
        { id: 's4', position: 1, color: '#ffb703', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:neon',
    name: $t('neon'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'n1', position: 0, color: '#7209b7', alpha: 1 },
        { id: 'n2', position: 0.5, color: '#b5179e', alpha: 1 },
        { id: 'n3', position: 1, color: '#4cc9f0', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:forest',
    name: $t('forest'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'fo1', position: 0, color: '#004b23', alpha: 1 },
        { id: 'fo2', position: 0.3, color: '#007200', alpha: 1 },
        { id: 'fo3', position: 0.6, color: '#38b000', alpha: 1 },
        { id: 'fo4', position: 1, color: '#ccff33', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:gold',
    name: $t('gold'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'g1', position: 0, color: '#582f0e', alpha: 1 },
        { id: 'g2', position: 0.4, color: '#7f4f24', alpha: 1 },
        { id: 'g3', position: 0.7, color: '#b08968', alpha: 1 },
        { id: 'g4', position: 1, color: '#ede0d4', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:ice',
    name: $t('ice'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'i1', position: 0, color: '#caf0f8', alpha: 1 },
        { id: 'i2', position: 0.5, color: '#ade8f4', alpha: 1 },
        { id: 'i3', position: 1, color: '#0077b6', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:vaporwave',
    name: $t('vaporwave'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'v1', position: 0, color: '#ff71ce', alpha: 1 },
        { id: 'v2', position: 0.25, color: '#01cdfe', alpha: 1 },
        { id: 'v3', position: 0.5, color: '#05ffa1', alpha: 1 },
        { id: 'v4', position: 0.75, color: '#b967ff', alpha: 1 },
        { id: 'v5', position: 1, color: '#fffb96', alpha: 1 },
      ],
    },
  },
  {
    id: 'gradient:aurora',
    name: $t('aurora'),
    kind: 'gradient',
    gradient: {
      type: 'linear',
      angle: 135,
      stops: [
        { id: 'a1', position: 0, color: '#011627', alpha: 1 },
        { id: 'a2', position: 0.4, color: '#2ec4b6', alpha: 1 },
        { id: 'a3', position: 0.7, color: '#e71d36', alpha: 1 },
        { id: 'a4', position: 1, color: '#ff9f1c', alpha: 1 },
      ],
    },
  },
];
export const customColor = (color: string): ColorBackground => ({
  id: `color:custom:${color.toLowerCase()}`,
  name: $t('customColor'),
  kind: 'color',
  color,
});
export const customGradient = (gradient: GradientBackground): GradientCatalogBackground => ({
  id: 'gradient:custom',
  name: $t('customGradient'),
  kind: 'gradient',
  gradient: normalizeGradient(gradient),
});
