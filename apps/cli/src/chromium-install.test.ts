// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { chromiumExecutable, installChromium } from './chromium-install';
const state = vi.hoisted(() => ({
  access: vi.fn(),
  path: vi.fn(() => '/managed/chrome'),
  install: vi.fn(async () => ({ executablePath: '/installed/chrome' })),
  settings: vi.fn(() => ({ cache: '/cache', executable: undefined as string | undefined })),
}));
vi.mock('node:fs/promises', () => ({ access: state.access }));
vi.mock('@puppeteer/browsers', () => ({
  Browser: { CHROME: 'chrome' },
  computeExecutablePath: state.path,
  install: state.install,
}));
vi.mock('./chromium-settings', () => ({ chromiumSettings: state.settings }));
afterEach(() => {
  vi.clearAllMocks();
  state.access.mockReset();
  state.settings.mockReturnValue({ cache: '/cache', executable: undefined });
});
it('installs the revision pinned by the installed Puppeteer package', async () => {
  expect(await installChromium()).toMatchObject({ executable: '/installed/chrome', version: expect.any(String) });
  expect(state.install).toHaveBeenCalledWith({ browser: 'chrome', buildId: expect.any(String), cacheDir: '/cache' });
});
it('checks managed or explicitly configured executables before launching', async () => {
  expect(await chromiumExecutable()).toBe('/managed/chrome');
  state.settings.mockReturnValue({ cache: '/cache', executable: '/custom/chrome' });
  expect(await chromiumExecutable()).toBe('/custom/chrome');
  expect(state.path).toHaveBeenCalledOnce();
});
it('reports installation instructions when the backend is unavailable', async () => {
  state.access.mockRejectedValueOnce(new Error('ENOENT'));
  await expect(chromiumExecutable()).rejects.toThrow('beam browser install');
});
