import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePublicAssetUrl } from '../public-asset';

describe('resolvePublicAssetUrl', () => {
  beforeEach(() => vi.stubEnv('BASE_URL', './'));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
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
  it.each(['index', 'editor', 'teleprompter'])(
    'resolves public images above the %s document in development',
    (entry) => {
      vi.stubGlobal('window', {
        location: {
          href: `http://localhost:6500/html/${entry}.html?panel=settings`,
        },
      });
      expect(resolvePublicAssetUrl('/brand/BeamIcon.webp')).toBe('http://localhost:6500/brand/BeamIcon.webp');
    },
  );
  it.each(['index', 'editor', 'screen-region'])(
    'resolves packaged images above the %s document without losing spaces',
    (entry) => {
      vi.stubGlobal('window', {
        location: { href: `file:///opt/Beam%20App/dist/html/${entry}.html` },
      });
      expect(resolvePublicAssetUrl('./wallpapers/image/sequoia-blue.webp')).toBe(
        'file:///opt/Beam%20App/dist/wallpapers/image/sequoia-blue.webp',
      );
    },
  );
  it('uses the Vite base when a worker has no renderer window', () => {
    vi.stubGlobal('window', undefined);
    expect(resolvePublicAssetUrl('/brand/BeamIcon.webp')).toBe('./brand/BeamIcon.webp');
  });
  it('uses the Vite base when no document location is available', () => {
    vi.stubGlobal('window', {});
    expect(resolvePublicAssetUrl('/brand/BeamIcon.webp')).toBe('./brand/BeamIcon.webp');
  });
  it('uses the Vite base if the document location is invalid', () => {
    vi.stubGlobal('window', { location: { href: 'invalid' } });
    expect(resolvePublicAssetUrl('/brand/BeamIcon.webp')).toBe('./brand/BeamIcon.webp');
  });
  it.each([
    ['/beam', '/beam/brand/icon.png'],
    ['/beam/', '/beam/brand/icon.png'],
    ['', './brand/icon.png'],
  ])('resolves assets with the configured Vite base %s outside a document', (base, expected) => {
    vi.stubEnv('BASE_URL', base);
    vi.stubGlobal('window', undefined);
    expect(resolvePublicAssetUrl('brand/icon.png')).toBe(expected);
  });
});
