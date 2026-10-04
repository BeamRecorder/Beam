const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertLgplFfmpegLibraries, inspectFfmpegLibraries } = require('../scripts/native/ffmpeg-export-license.cjs');
const { lgplRecords } = require('./fixtures/ffmpeg-export/licenses.cjs');

test('accepts dynamically linked LGPL 2.1 and LGPL 3 libraries', () => {
  for (const version of ['2.1', '3']) {
    const records = lgplRecords();
    for (const record of records) record.license = `LGPL version ${version} or later`;
    assert.equal(assertLgplFfmpegLibraries(records), records);
  }
});

test('rejects incomplete, invalid and duplicate library records', () => {
  for (const records of [null, {}, [], lgplRecords().slice(1), [...lgplRecords(), null]])
    assert.throws(() => assertLgplFfmpegLibraries(records), /all four/);
  for (const replacement of [null, {}, { library: 'swscale' }, lgplRecords()[0]]) {
    const records = lgplRecords();
    records[1] = replacement;
    assert.throws(() => assertLgplFfmpegLibraries(records), /Invalid or duplicate/);
  }
});

test('rejects GPL, nonfree, missing and unknown licenses on each library', () => {
  for (let index = 0; index < 4; index++)
    for (const license of ['GPL version 2 or later', 'GPL version 3 or later', 'nonfree', '', null]) {
      const records = lgplRecords();
      records[index].license = license;
      assert.throws(() => assertLgplFfmpegLibraries(records), /must be LGPL/);
    }
});

test('rejects GPL and nonfree configuration flags even with a claimed LGPL license', () => {
  for (const configuration of [null, '--enable-gpl', "'--enable-nonfree'", '--enable-shared --enable-gpl=yes']) {
    const records = lgplRecords();
    records[0].configuration = configuration;
    assert.throws(() => assertLgplFfmpegLibraries(records), /without --enable/);
  }
});

test('rejects static or unknown library origins', () => {
  for (const origin of [null, '', '/usr/lib/libavcodec.a', '/opt/beam-ffmpeg-export', '/usr/lib/libavutil.so.60']) {
    const records = lgplRecords();
    records[0].path = origin;
    assert.throws(() => assertLgplFfmpegLibraries(records), /dynamically linked/);
  }
});

test('queries actual linked libraries with the supplied loader environment', () => {
  const env = { LD_LIBRARY_PATH: '/opt/lgpl/lib' };
  let command;
  const records = inspectFfmpegLibraries('/opt/beam-ffmpeg-export', {
    env,
    run: (...args) => {
      command = args;
      return { status: 0, stdout: JSON.stringify(lgplRecords()) };
    },
  });
  assert.deepEqual(records, lgplRecords());
  assert.deepEqual(command, ['/opt/beam-ffmpeg-export', ['--ffmpeg-info'], { encoding: 'utf8', timeout: 5000, env }]);
});

test('rejects probe errors, missing runtime libraries and startup timeouts', () => {
  for (const result of [
    { status: 1, stderr: 'failure' },
    { status: 127, stderr: 'missing library' },
    { error: new Error('timeout') },
  ])
    assert.throws(() => inspectFfmpegLibraries('export', { run: () => result }), /Cannot inspect/);
});

test('rejects malformed probe output and failed license checks', () => {
  for (const stdout of ['', 'not json', '[]'])
    assert.throws(() => inspectFfmpegLibraries('export', { run: () => ({ status: 0, stdout }) }), /invalid|all four/);
  const records = lgplRecords();
  records[0].license = 'GPL version 3 or later';
  assert.throws(
    () => inspectFfmpegLibraries('export', { run: () => ({ status: 0, stdout: JSON.stringify(records) }) }),
    /must be LGPL/,
  );
});
