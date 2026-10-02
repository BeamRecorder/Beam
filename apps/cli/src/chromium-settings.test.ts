// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chromiumSettings } from './chromium-settings';
describe('headless backend choices', () => {
  it('selects software WebGL without an X11 backend or sandbox downgrade', () => {
    const settings = chromiumSettings({});
    expect(settings.args).toContain('--use-angle=swiftshader');
    expect(settings.args).not.toContain('--no-sandbox');
    expect(settings.executable).toBeUndefined();
    expect(settings.cache).toContain('.cache/beam/chromium');
  });
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
});
