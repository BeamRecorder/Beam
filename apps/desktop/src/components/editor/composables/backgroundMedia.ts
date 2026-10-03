import wallpapers from 'virtual:public-background-media';

export type BackgroundMediaKind = 'image' | 'video' | 'blur';

export interface BackgroundMedia {
  id: string;
  name: string;
  path: string;
  extension: string;
  kind: BackgroundMediaKind;
  fileName?: string;
}

export interface BackgroundMediaGroup {
  kind: BackgroundMediaKind;
  label: string;
  items: BackgroundMedia[];
}

const MEDIA_KIND_BY_EXTENSION: Record<string, BackgroundMediaKind> = {
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

const GROUP_LABELS: Record<BackgroundMediaKind, string> = {
  image: 'Images',
  video: 'Vidéos',
  blur: 'Blur',
};

const extensionFor = (path: string): string => {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
};

export const backgroundKindFor = (path: string): BackgroundMediaKind | null => {
  return MEDIA_KIND_BY_EXTENSION[extensionFor(path)] ?? null;
};

const nameFor = (path: string): string => {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  return withoutExtension.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

export const createBackgroundMedia = (paths: readonly string[]): BackgroundMedia[] => {
  const uniquePaths = [...new Set(paths)];

  return uniquePaths
    .map((path) => {
      const extension = extensionFor(path);
      const kind = backgroundKindFor(path);
      if (!kind) return null;

      return {
        id: path,
        name: nameFor(path),
        path,
        extension,
        kind,
      };
    })
    .filter((media): media is BackgroundMedia => media !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const groupBackgroundMedia = (media: readonly BackgroundMedia[]): BackgroundMediaGroup[] => {
  const groups = new Map<BackgroundMediaKind, BackgroundMedia[]>();

  for (const item of media) {
    const items = groups.get(item.kind) ?? [];
    items.push(item);
    groups.set(item.kind, items);
  }

  return (Object.keys(GROUP_LABELS) as BackgroundMediaKind[])
    .map((kind) => ({
      kind,
      label: GROUP_LABELS[kind],
      items: groups.get(kind) ?? [],
    }))
    .filter((group) => group.items.length > 0);
};

export const BACKGROUND_MEDIA = createBackgroundMedia([...wallpapers.images, ...wallpapers.videos]);

export const getRandomBackgroundImage = (
  candidates: readonly BackgroundMedia[] = BACKGROUND_MEDIA,
): BackgroundMedia | null => {
  const images = candidates.filter((item) => item.kind === 'image');
  if (images.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * images.length);
  return images[randomIndex] ?? null;
};
