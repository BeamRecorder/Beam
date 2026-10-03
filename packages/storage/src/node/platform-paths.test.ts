// @vitest-environment node
import { expect, it } from 'vitest';
import { applicationPaths } from './platform-paths';
it('resolves Windows paths independently of the test host', () => {
  expect(applicationPaths('win32', { APPDATA: 'D:\\Roaming', LOCALAPPDATA: 'D:\\Local' }, 'C:\\Users\\test')).toEqual({
    cache: 'D:\\Local\\Beam\\Cache',
    data: 'D:\\Roaming\\Beam',
  });
  expect(applicationPaths('win32', {}, 'C:\\Users\\test').data).toBe('C:\\Users\\test\\AppData\\Roaming\\Beam');
});
it('uses macOS application directories', () => {
  expect(applicationPaths('darwin', {}, '/Users/test')).toEqual({
    cache: '/Users/test/Library/Caches/Beam',
    data: '/Users/test/Library/Application Support/Beam',
  });
});
it('honors Linux XDG directories and fails unsupported backends', () => {
  expect(applicationPaths('linux', { XDG_CACHE_HOME: '/cache', XDG_DATA_HOME: '/data' }, '/home/test')).toEqual({
    cache: '/cache/beam',
    data: '/data/beam',
  });
  expect(applicationPaths('linux', {}, '/home/test').data).toBe('/home/test/.local/share/beam');
  expect(() => applicationPaths('freebsd', {}, '/home/test')).toThrow('Unsupported platform');
});
