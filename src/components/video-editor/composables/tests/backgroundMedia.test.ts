import { describe, expect, it } from 'vitest';
import {
  backgroundKindFor,
  createBackgroundMedia,
  createWallpaperMedia,
  customColor,
  customGradient,
  findMatchingBackgroundMedia,
  getRandomBackgroundImage,
  groupBackgroundMedia,
  normalizeBackgroundValue,
  normalizeGradient,
} from '../backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

describe('background media', () => {
  it('classifies every supported extension case-insensitively', () => {
    expect(
      ['avif', 'bmp', 'jpeg', 'jpg', 'png', 'webp'].map((extension) =>
        backgroundKindFor(`/media/file.${extension.toUpperCase()}`),
      ),
    ).toEqual(['image', 'image', 'image', 'image', 'image', 'image']);
    expect(backgroundKindFor('/media/animation.gif')).toBeNull();
    expect(
      ['m4v', 'mov', 'mp4', 'ogv', 'webm'].map((extension) => backgroundKindFor(`/media/file.${extension}`)),
    ).toEqual(['video', 'video', 'video', 'video', 'video']);
  });

  it('rejects paths with no supported extension', () => {
    expect(backgroundKindFor('/media/file.txt')).toBeNull();
    expect(backgroundKindFor('/media/no-extension')).toBeNull();
    expect(backgroundKindFor('')).toBeNull();
    expect(backgroundKindFor('/media/.hidden')).toBeNull();
  });

  it('deduplicates, filters, normalizes names, and sorts media', () => {
    expect(
      createBackgroundMedia([
        '/media/zebra_video.MP4',
        '/media/my_background-image.png',
        '/media/zebra_video.MP4',
        '/media/ignore.txt',
      ]),
    ).toEqual([
      {
        id: resolvePublicAssetUrl('/media/my_background-image.png'),
        name: 'My Background Image',
        path: resolvePublicAssetUrl('/media/my_background-image.png'),
        extension: 'png',
        kind: 'image',
      },
      {
        id: resolvePublicAssetUrl('/media/zebra_video.MP4'),
        name: 'Zebra Video',
        path: resolvePublicAssetUrl('/media/zebra_video.MP4'),
        extension: 'mp4',
        kind: 'video',
      },
    ]);
  });

  it('supports paths without a directory segment', () => {
    expect(createBackgroundMedia(['plain_name.png'])).toEqual([
      {
        id: resolvePublicAssetUrl('plain_name.png'),
        name: 'Plain Name',
        path: resolvePublicAssetUrl('plain_name.png'),
        extension: 'png',
        kind: 'image',
      },
    ]);
  });

  it('keeps built-in images and videos in their dedicated collections', () => {
    expect(
      createWallpaperMedia(
        ['/wallpapers/image/nested/landscape.PNG', '/wallpapers/image/wrong.mp4'],
        ['/wallpapers/video/nested/loop.WEBM', '/wallpapers/video/wrong.jpg'],
      ),
    ).toEqual([
      expect.objectContaining({
        path: resolvePublicAssetUrl('/wallpapers/image/nested/landscape.webp'),
        kind: 'image',
      }),
      expect.objectContaining({ path: resolvePublicAssetUrl('/wallpapers/video/nested/loop.WEBM'), kind: 'video' }),
    ]);
  });

  it('does not turn misplaced or unsupported built-in files into wallpapers', () => {
    expect(
      createWallpaperMedia(
        ['/wallpapers/image/clip.mp4', '/app/icon.png'],
        ['/wallpapers/video/photo.jpg', '/public/other.webm'],
      ),
    ).toEqual([]);
    expect(createWallpaperMedia([], [])).toEqual([]);
  });

  it('groups media in display order and excludes empty groups', () => {
    const media = createBackgroundMedia(['/z.mp4', '/b.png', '/c.jpg']);
    const groups = groupBackgroundMedia(media);
    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe('image');
    expect(groups[0].items).toEqual([media[0], media[1]]);
    expect(groups[1].kind).toBe('video');
    expect(groups[1].items).toEqual([media[2]]);
    expect(groupBackgroundMedia([])).toEqual([]);
  });

  it('normalizes custom color and gradients into typed background values', () => {
    expect(customColor('#123456')).toMatchObject({ kind: 'color', color: '#123456' });
    expect(
      customGradient({
        type: 'linear',
        angle: 450,
        stops: [
          { id: 'a', position: 0, color: '#000000', alpha: 1 },
          { id: 'b', position: 1, color: '#ffffff', alpha: 1 },
        ],
      }).gradient.angle,
    ).toBe(90);
    expect(normalizeBackgroundValue({ kind: 'gradient', gradient: { stops: [] } })).toMatchObject({
      kind: 'gradient',
      gradient: { stops: [{ position: 0 }, { position: 1 }] },
    });
  });

  it('rejects malformed persisted background values', () => {
    expect(normalizeBackgroundValue({ kind: 'color', color: 'red' })).toBeNull();
    expect(normalizeBackgroundValue({ kind: 'video', path: '/wrong.png' })).toBeNull();
    expect(normalizeBackgroundValue(null)).toBeNull();
  });

  it('normalizes missing, malformed, and radial gradient fields', () => {
    expect(normalizeGradient(null)).toMatchObject({
      type: 'linear',
      angle: 135,
      stops: [{ color: '#4f46e5' }, { color: '#ec4899' }],
    });
    expect(
      normalizeGradient({
        type: 'radial',
        angle: -90,
        stops: [
          { position: 'bad', color: 'nope', alpha: 4 },
          { id: 'end', position: 2, color: '#ABCDEF', alpha: -1 },
        ],
      }),
    ).toEqual({
      type: 'radial',
      angle: 270,
      stops: [
        { id: 'stop-0', position: 0, color: '#ffffff', alpha: 1 },
        { id: 'end', position: 1, color: '#ABCDEF', alpha: 0 },
      ],
    });
  });

  it('fills optional persisted media, color, and gradient identifiers', () => {
    expect(normalizeBackgroundValue({ kind: 'image', path: '/media/photo.png' })).toMatchObject({
      id: resolvePublicAssetUrl('/media/photo.png'),
      name: 'Photo',
      extension: 'png',
    });
    expect(normalizeBackgroundValue({ kind: 'color', color: '#ABCDEF' })).toMatchObject({
      id: 'color:#abcdef',
      name: '#ABCDEF',
    });
    expect(
      normalizeBackgroundValue({
        kind: 'gradient',
        gradient: { type: 'radial', stops: [{ color: '#000000' }, { color: '#ffffff' }] },
      }),
    ).toMatchObject({ id: 'gradient:custom', name: 'Custom gradient', gradient: { type: 'radial' } });
  });

  it('matches legacy wallpaper paths (.avif, .jpg) to current .webp wallpapers', () => {
    const candidates = [
      {
        id: './wallpapers/image/bluerays.webp',
        name: 'Bluerays',
        path: './wallpapers/image/bluerays.webp',
        extension: 'webp',
        kind: 'image' as const,
      },
    ];

    expect(findMatchingBackgroundMedia(candidates, './wallpapers/image/bluerays.avif')).toEqual(candidates[0]);
    expect(findMatchingBackgroundMedia(candidates, './wallpapers/image/bluerays.jpg')).toEqual(candidates[0]);
    expect(findMatchingBackgroundMedia(candidates, 'bluerays')).toEqual(candidates[0]);
  });

  it('selects a random background image from available image media only', () => {
    const candidates = [
      { id: '1', name: 'Img 1', path: '/wallpapers/image/1.webp', extension: 'webp', kind: 'image' as const },
      { id: '2', name: 'Video 1', path: '/wallpapers/video/2.mp4', extension: 'mp4', kind: 'video' as const },
      { id: '3', name: 'Img 2', path: '/wallpapers/image/3.webp', extension: 'webp', kind: 'image' as const },
    ];
    const picked = getRandomBackgroundImage(candidates);
    expect(picked).not.toBeNull();
    expect(picked?.kind).toBe('image');
    expect(['1', '3']).toContain(picked?.id);
  });
});
