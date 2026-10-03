// @vitest-environment node
import { expect, it } from 'vitest';
import { ffmpegHostPaths } from './ffmpeg-host-paths';
it.each(['win32', 'darwin', 'freebsd'] as const)('rejects the Linux-only backend on %s', (platform) => {
  expect(() => ffmpegHostPaths({ DISPLAY: ':0' }, platform)).toThrow('Linux-only');
});
it.each([{}, { DISPLAY: '' }, { WAYLAND_DISPLAY: 'wayland-0' }])('requires an X11/XWayland display (%j)', (env) => {
  expect(() => ffmpegHostPaths(env, 'linux')).toThrow('DISPLAY');
});
it('resolves explicit executable and native build locations without splitting paths with spaces', () => {
  const paths = ffmpegHostPaths(
    {
      DISPLAY: ':0',
      BEAM_ELECTRON_EXECUTABLE: '/beam with spaces',
      BEAM_FFMPEG_EXPORT_DIRECTORY: '/native with spaces',
    },
    'linux',
    false,
  );
  expect(paths.executable).toBe('/beam with spaces');
  expect(paths.nativeDirectory).toBe('/native with spaces');
  expect(paths.host).toMatch(/ffmpeg-host\.cjs$/);
  expect(paths.preload).toMatch(/packages\/electron-export\/src\/gpu-preload\.cjs$/);
});
it('uses the installed Beam executable and packaged native artifacts in Node mode', () => {
  const paths = ffmpegHostPaths(
    { DISPLAY: ':0', BEAM_RESOURCES_PATH: '/app/resources', BEAM_COMPILED_CLI: 'true' },
    'linux',
    true,
  );
  expect(paths.executable).toBe(process.execPath);
  expect(paths.nativeDirectory).toBe('/app/resources/ffmpeg-export');
  expect(paths.preload).toMatch(/apps\/cli\/src\/gpu-preload\.cjs$/);
});
it('resolves development Electron and artifacts beside the workspace', () => {
  const paths = ffmpegHostPaths({ DISPLAY: ':0' }, 'linux', false);
  expect(paths.executable).toMatch(/electron\/dist\/electron$/);
  expect(paths.nativeDirectory).toMatch(/build\/native\/ffmpeg-export$/);
  expect(ffmpegHostPaths({ DISPLAY: ':0', BEAM_APPLICATION_ROOT: '/custom-root' }, 'linux', true).nativeDirectory).toBe(
    '/custom-root/build/native/ffmpeg-export',
  );
});
