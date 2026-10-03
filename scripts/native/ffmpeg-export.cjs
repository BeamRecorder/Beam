const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

function buildFfmpegExport({ root = join(__dirname, '../..'), platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') throw new Error('Experimental FFmpeg GPU export is available only on Linux.');
  const source = join(root, 'packages/encoder/native/linux');
  const output = join(root, 'build/native/ffmpeg-export');
  const pkg = spawnSync(
    'pkg-config',
    ['--cflags', '--libs', 'libavcodec', 'libavutil', 'libavfilter', 'libavformat', 'libva', 'libdrm'],
    { encoding: 'utf8' },
  );
  const flags = env.BEAM_FFMPEG_BUILD_FLAGS
    ? env.BEAM_FFMPEG_BUILD_FLAGS.split(/\s+/).filter(Boolean)
    : pkg.stdout?.trim().split(/\s+/).filter(Boolean);
  if (!env.BEAM_FFMPEG_BUILD_FLAGS && pkg.status !== 0) {
    throw new Error(
      'Install the FFmpeg, libva and libdrm development packages, then run bun run build:ffmpeg-export. See docs/dev/ffmpeg-gpu-export.md.',
    );
  }
  mkdirSync(output, { recursive: true });
  const nodeHeaders =
    env.BEAM_NODE_INCLUDE ||
    [join(dirname(process.execPath), '../include/node'), '/usr/include/node'].find((directory) =>
      existsSync(join(directory, 'node_api.h')),
    );
  if (!nodeHeaders) throw new Error('Install Node.js development headers or set BEAM_NODE_INCLUDE.');
  for (const [name, files, libraries] of [
    ['beam-ffmpeg-export', ['export-main.cc', 'gpu-conversion.cc', 'video-encoder.cc'], flags],
    [
      'beam-gpu-transport.node',
      [join(root, 'apps/desktop/electron/export/native/frame-bridge.cc')],
      ['-shared', '-fPIC', '-DNAPI_VERSION=8', '-I', nodeHeaders],
    ],
  ]) {
    const result = spawnSync(
      env.CXX || 'c++',
      [
        '-std=c++17',
        '-O2',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        source,
        ...files.map((file) => (name.endsWith('.node') ? file : join(source, file))),
        ...libraries,
        '-o',
        join(output, name),
      ],
      { stdio: 'inherit', env },
    );
    if (result.error || result.status !== 0)
      throw new Error(`Cannot build ${name}: ${result.error?.message ?? `compiler exit ${result.status}`}`);
  }
  return output;
}

if (require.main === module) {
  try {
    console.log(buildFfmpegExport());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { buildFfmpegExport };
