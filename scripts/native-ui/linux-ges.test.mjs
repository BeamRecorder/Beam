import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delimiter, join } from 'node:path';
import { nativeBuildEnvironment } from './linux-ges.mjs';

const version = '1.28.7-1.fc44.x86_64';
const sdk = join('/test-home', '.cache/beam/ges-sdk', version, 'usr/lib64');
const files = new Set([join(sdk, 'pkgconfig/gst-editing-services-1.0.pc'), join(sdk, 'libges-1.0.so')]);
function inspect(command, args) {
  if (command === 'rpm') return { status: 0, stdout: version };
  if (args[0] === '--modversion') return { status: 0, stdout: '1.28.7' };
  return { status: 1, stdout: '' };
}

test('leaves non-Linux builds and working system SDKs unchanged', () => {
  const env = { PKG_CONFIG_PATH: '/system/pkgconfig' };
  assert.equal(nativeBuildEnvironment(env, { platform: 'darwin' }), env);
  assert.equal(
    nativeBuildEnvironment(env, {
      platform: 'linux',
      inspect: () => ({ status: 0, stdout: '/system/lib' }),
      exists: (path) => path === join('/system/lib', 'libges-1.0.so'),
    }),
    env,
  );
});

test('recovers stale temporary paths from the matching cached Fedora SDK', () => {
  const env = { PKG_CONFIG_PATH: '/tmp/beam-ges/usr/lib64/pkgconfig', LIBRARY_PATH: '/other/lib' };
  const result = nativeBuildEnvironment(env, {
    platform: 'linux',
    home: '/test-home',
    inspect,
    exists: (path) => files.has(path),
  });
  assert.equal(result.PKG_CONFIG_PATH, `${join(sdk, 'pkgconfig')}${delimiter}/tmp/beam-ges/usr/lib64/pkgconfig`);
  assert.equal(result.LIBRARY_PATH, `${sdk}${delimiter}/other/lib`);
  assert.equal(env.PKG_CONFIG_PATH, '/tmp/beam-ges/usr/lib64/pkgconfig');
});

test('reports missing development files instead of reaching the linker', () => {
  assert.throws(
    () =>
      nativeBuildEnvironment(
        {},
        {
          platform: 'linux',
          home: '/test-home',
          inspect,
          exists: () => false,
        },
      ),
    /install gst-editing-services-devel/,
  );
});

test('rejects a cached SDK whose pkg-config version differs from the runtime', () => {
  const wrongVersion = (command, args) =>
    args[0] === '--modversion' ? { status: 0, stdout: '1.28.1' } : inspect(command, args);
  assert.throws(
    () =>
      nativeBuildEnvironment(
        {},
        {
          platform: 'linux',
          home: '/test-home',
          inspect: wrongVersion,
          exists: (path) => files.has(path),
        },
      ),
    /do not match/,
  );
});
