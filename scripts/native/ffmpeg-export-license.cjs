const { basename } = require('node:path');
const { spawnSync } = require('node:child_process');

const libraries = ['avcodec', 'avutil', 'avfilter', 'avformat'];

function assertLgplFfmpegLibraries(records) {
  if (!Array.isArray(records) || records.length !== libraries.length)
    throw new Error('Expected license information for all four FFmpeg libraries.');
  const seen = new Set();
  for (const record of records) {
    if (!record || !libraries.includes(record.library) || seen.has(record.library))
      throw new Error('Invalid or duplicate FFmpeg library license information.');
    seen.add(record.library);
    if (!/^LGPL version (2\.1|3) or later$/.test(record.license ?? ''))
      throw new Error(`${record.library} must be LGPL; found ${record.license ?? 'an unknown license'}.`);
    if (
      typeof record.configuration !== 'string' ||
      /(?:^|[\s'"])(?:--enable-gpl|--enable-nonfree)(?:$|[\s'"]|=)/.test(record.configuration)
    )
      throw new Error(`${record.library} must be built without --enable-gpl or --enable-nonfree.`);
    if (
      typeof record.path !== 'string' ||
      !new RegExp(`^lib${record.library}\\.so(?:\\.\\d+)*$`).test(basename(record.path))
    )
      throw new Error(`${record.library} must be dynamically linked to an external shared library.`);
  }
  return records;
}

function inspectFfmpegLibraries(executable, { run = spawnSync, env = process.env } = {}) {
  const result = run(executable, ['--ffmpeg-info'], { encoding: 'utf8', timeout: 5000, env });
  if (result.error || result.status !== 0)
    throw new Error('Cannot inspect FFmpeg libraries: ' + (result.error?.message ?? result.stderr));
  let records;
  try {
    records = JSON.parse(result.stdout);
  } catch {
    throw new Error('The native exporter returned invalid FFmpeg license information.');
  }
  return assertLgplFfmpegLibraries(records);
}

module.exports = { assertLgplFfmpegLibraries, inspectFfmpegLibraries };
