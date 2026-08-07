import { describe, expect, it } from 'vitest';
import { resolvePublicAssetUrl } from '../public-asset';

describe('resolvePublicAssetUrl', () => {
  it('returns empty string or falsy value untouched', () => {
    expect(resolvePublicAssetUrl('')).toBe('');
  });

  it('preserves full URLs and special protocols untouched', () => {
    expect(resolvePublicAssetUrl('https://example.com/bg.png')).toBe('https://example.com/bg.png');
    expect(resolvePublicAssetUrl('http://example.com/bg.png')).toBe('http://example.com/bg.png');
    expect(resolvePublicAssetUrl('file:///path/to/bg.png')).toBe('file:///path/to/bg.png');
    expect(resolvePublicAssetUrl('data:image/png;base64,123')).toBe('data:image/png;base64,123');
    expect(resolvePublicAssetUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(resolvePublicAssetUrl('project-media://asset/123')).toBe('project-media://asset/123');
  });

  it('normalizes leading slashes and relative dots cleanly to absolute URL when location.origin exists', () => {
    const origin = window.location.origin;
    expect(resolvePublicAssetUrl('/wallpapers/image/bluerays.webp')).toBe(`${origin}/wallpapers/image/bluerays.webp`);
    expect(resolvePublicAssetUrl('./wallpapers/image/bluerays.webp')).toBe(`${origin}/wallpapers/image/bluerays.webp`);
    expect(resolvePublicAssetUrl('wallpapers/image/bluerays.webp')).toBe(`${origin}/wallpapers/image/bluerays.webp`);
  });

  it('is idempotent when called multiple times on the same path', () => {
    const origin = window.location.origin;
    const first = resolvePublicAssetUrl('./wallpapers/image/bluerays.webp');
    const second = resolvePublicAssetUrl(first);
    const third = resolvePublicAssetUrl(second);

    expect(first).toBe(`${origin}/wallpapers/image/bluerays.webp`);
    expect(second).toBe(`${origin}/wallpapers/image/bluerays.webp`);
    expect(third).toBe(`${origin}/wallpapers/image/bluerays.webp`);
  });

});
