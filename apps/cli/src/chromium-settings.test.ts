// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chromiumSettings } from './chromium-settings';
describe('headless backend choices', () => {
  it('selects software WebGL without an X11 backend or sandbox downgrade', () => {
    const settings = chromiumSettings({}, 'linux');
    expect(settings.args).toContain('--use-angle=swiftshader');
    expect(settings.args).not.toContain('--no-sandbox');
    expect(settings.args).not.toContain('--enable-features=AcceleratedVideoEncoder');
    expect(settings.executable).toBeUndefined();
    expect(settings.cache).toContain('.cache/beam/chromium');
  });
  it.each(['linux', 'win32', 'darwin'] as const)(
    'activates the %s hardware backend without Linux flags on other OSes',
    (platform) => {
      const settings = chromiumSettings({ BEAM_CHROMIUM_GPU: 'hardware', BEAM_CHROMIUM_CACHE: '/cache' }, platform);
      expect(settings.args).toContain('--enable-gpu');
      expect(settings.args.includes('--enable-features=AcceleratedVideoEncoder')).toBe(platform === 'linux');
      expect(settings.args).not.toContain('--no-sandbox');
      expect(settings.args).not.toContain('--ignore-gpu-blocklist');
    },
  );
  it('accepts an explicitly configured hardware backend and executable', () => {
    const settings = chromiumSettings({
      BEAM_CHROMIUM_GPU: 'hardware',
      BEAM_CHROMIUM_EXECUTABLE: '/chrome',
      BEAM_CHROMIUM_CACHE: '/cache',
    });
    expect(settings.args).toContain('--enable-gpu');
    expect(settings.args).not.toContain('--use-angle=swiftshader');
    expect(settings.executable).toBe('/chrome');
    expect(settings.cache).toBe('/cache');
  });
  it('rejects an unknown backend instead of silently changing renderers', () => {
    expect(() => chromiumSettings({ BEAM_CHROMIUM_GPU: 'unavailable' })).toThrow('software or hardware');
  });
  it('retains automatic video decoding by default', () => {
    expect(chromiumSettings({}).args).not.toContain('--disable-accelerated-video-decode');
    expect(chromiumSettings({ BEAM_CHROMIUM_VIDEO_DECODE: 'auto' }).args).not.toContain(
      '--disable-accelerated-video-decode',
    );
  });
  it.each(['linux', 'win32', 'darwin'] as const)(
    'can disable a failing hardware decoder on %s independently of GPU rendering',
    (platform) => {
      const settings = chromiumSettings(
        { BEAM_CHROMIUM_GPU: 'hardware', BEAM_CHROMIUM_VIDEO_DECODE: 'software' },
        platform,
      );
      expect(settings.args).toContain('--disable-accelerated-video-decode');
      expect(settings.args).toContain('--enable-gpu');
      expect(settings.args).not.toContain('--use-angle=swiftshader');
    },
  );
  it('rejects unknown decoder settings', () => {
    expect(() => chromiumSettings({ BEAM_CHROMIUM_VIDEO_DECODE: 'unknown' })).toThrow('auto or software');
  });
});
