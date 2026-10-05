const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const install = require('../scripts/native/desktop-cli.cjs');
const { verifyCliCompiler } = require('../scripts/native/cli-compiler.cjs');
const { lgplRecords } = require('./fixtures/ffmpeg-export/licenses.cjs');
const root = resolve(__dirname, '..');
test('packaging maps the compiler dependency directory explicitly instead of losing node_modules', () => {
  const resources = require('../package.json').build.extraResources;
  assert.ok(
    resources.some(
      (resource) => resource.from === 'apps/cli/dist/node_modules' && resource.to === 'beam-cli/node_modules',
    ),
  );
});
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'beam-installed-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function compiler(resources, target) {
  for (const dependency of [`@rolldown/binding-${target}`, `lightningcss-${target}`]) {
    const directory = join(resources, 'beam-cli/node_modules', dependency);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), '{}');
  }
}
test('Linux packaged executable dispatches CLI before the desktop and preserves quoted arguments', async () =>
  fixture(async (directory) => {
    const project = join(directory, 'project');
    await mkdir(join(project, 'build/cli'), { recursive: true });
    for (const launcher of ['linux-beam', 'posix-beam-cli'])
      await copyFile(join(root, 'build/cli', launcher), join(project, 'build/cli', launcher));
    const native = join(project, 'build/native/ffmpeg-export');
    await mkdir(native, { recursive: true });
    await writeFile(
      join(native, 'beam-ffmpeg-export'),
      `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(lgplRecords())}'\n`,
      { mode: 0o755 },
    );
    await writeFile(join(native, 'beam-gpu-transport.node'), 'test addon');
    await mkdir(join(directory, 'resources/cli'), { recursive: true });
    await writeFile(join(directory, 'beam'), '#!/bin/sh\nprintf "gui:%s" "$*"\n', { mode: 0o755 });
    await writeFile(join(directory, 'resources/cli/beam'), '#!/bin/sh\nprintf "cli:%s|%s" "$1" "$2"\n', {
      mode: 0o755,
    });
    await compiler(join(directory, 'resources'), 'linux-x64-gnu');
    await install({ arch: 1, electronPlatformName: 'linux', appOutDir: directory, packager: { projectDir: project } });
    assert.equal(
      await readFile(join(directory, 'resources/ffmpeg-export/beam-gpu-transport.node'), 'utf8'),
      'test addon',
    );
    assert.equal(
      execFileSync(join(directory, 'beam'), ['--cli', 'inspect', 'path with spaces'], { encoding: 'utf8' }),
      'cli:inspect|path with spaces',
    );
    assert.equal(
      execFileSync(
        join(directory, 'beam'),
        ['--no-sandbox', '--ozone-platform=x11', '--cli', 'inspect', 'path with spaces'],
        { encoding: 'utf8' },
      ),
      'cli:inspect|path with spaces',
    );
    assert.equal(
      execFileSync(join(directory, 'beam'), ['--ozone-platform=x11'], { encoding: 'utf8' }),
      'gui:--ozone-platform=x11',
    );
    assert.equal(
      execFileSync(join(directory, 'beam-cli'), ['inspect', 'path with spaces'], { encoding: 'utf8' }),
      'cli:inspect|path with spaces',
    );
    await mkdir(join(directory, 'bin'));
    await symlink(join(directory, 'beam-cli'), join(directory, 'bin/beam-cli'));
    assert.equal(
      execFileSync(join(directory, 'bin/beam-cli'), ['inspect', 'space path'], { encoding: 'utf8' }),
      'cli:inspect|space path',
    );
  }));
test('macOS and Windows install CLI launchers alongside their application executables', async () =>
  fixture(async (directory) => {
    const mac = join(directory, 'Beam.app/Contents/MacOS');
    await mkdir(mac, { recursive: true });
    await compiler(join(directory, 'Beam.app/Contents/Resources'), 'darwin-arm64');
    await install({
      arch: 3,
      electronPlatformName: 'darwin',
      appOutDir: directory,
      packager: { projectDir: root, appInfo: { productFilename: 'Beam' } },
    });
    assert.match(await readFile(join(mac, 'beam-cli'), 'utf8'), /\.\.\/Resources\/cli\/beam/);
    await compiler(join(directory, 'resources'), 'win32-x64-msvc');
    await install({ arch: 1, electronPlatformName: 'win32', appOutDir: directory, packager: { projectDir: root } });
    assert.match(await readFile(join(directory, 'beam-cli.cmd'), 'utf8'), /resources\\cli\\beam.cmd/);
    assert.match(await readFile(join(root, 'apps/desktop/cli/beam'), 'utf8'), /\.\.\/\.\.\/MacOS\/Beam/);
    assert.match(await readFile(join(root, 'apps/desktop/cli/beam.cmd'), 'utf8'), /ELECTRON_RUN_AS_NODE=1/);
  }));
test('unknown desktop targets fail instead of producing an unusable launcher', async () => {
  await assert.rejects(
    install({ electronPlatformName: 'freebsd', appOutDir: '/unused', packager: { projectDir: root } }),
    /Unsupported/,
  );
});
test('cross-architecture packaging requires both matching compiler bindings', async () =>
  fixture(async (directory) => {
    await compiler(directory, 'win32-x64-msvc');
    await assert.rejects(verifyCliCompiler(directory, 'win32', 3), /win32\/arm64/);
    await compiler(directory, 'win32-arm64-msvc');
    await verifyCliCompiler(directory, 'win32', 3);
    await rm(join(directory, 'beam-cli/node_modules/lightningcss-win32-arm64-msvc'), { recursive: true });
    await assert.rejects(verifyCliCompiler(directory, 'win32', 3), /lightningcss/);
  }));
test('unsupported compiler architectures fail before emitting launchers', async () => {
  await assert.rejects(verifyCliCompiler('/unused', 'linux', 0), /Unsupported/);
  await assert.rejects(verifyCliCompiler('/unused', 'freebsd', 1), /Unsupported/);
});
