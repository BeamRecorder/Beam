const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseProfile, probeArguments, readProbeResult } = require('../scripts/diagnostics/webcodecs-export.cjs');

test('diagnostic defaults reproduce the reported AVC 1080p CBR export', () => {
  assert.deepEqual(parseProfile([]), {
    codec: 'avc1.640028',
    width: 1920,
    height: 1080,
    framerate: 30,
    bitrate: 5_910_000,
    bitrateMode: 'constant',
    frames: 30,
  });
});

test('diagnostic accepts VP9, AV1, VBR and bounded dimensions', () => {
  assert.equal(parseProfile(['--codec=vp9']).codec, 'vp09.00.40.08');
  assert.equal(parseProfile(['--codec=av1']).codec, 'av01.0.08M.08');
  assert.deepEqual(parseProfile(['--width=3840', '--height=2160', '--bitrate-mode=variable']), {
    ...parseProfile([]),
    width: 3840,
    height: 2160,
    bitrateMode: 'variable',
  });
  assert.equal(parseProfile(['--width=2', '--height=4096']).width, 2);
});

test('diagnostic rejects invalid, ambiguous and excessive options', () => {
  for (const option of [
    '--codec=hevc',
    '--codec=__proto__',
    '--bitrate-mode=cbr',
    '--width=0',
    '--width=4098',
    '--width=3',
    '--width=1.5',
    '--width=2e3',
    '--height=-2',
    '--height=',
    '--unknown=1',
    '--width',
  ]) {
    assert.throws(() => parseProfile([option]), Error, option);
  }
  assert.throws(() => parseProfile(['--codec=avc', '--codec=vp9']), /repeated/);
});

test('Linux diagnostic selects X11 through the original process arguments', () => {
  const settings = { input: 'gpu', acceleration: 'prefer-hardware', profile: parseProfile([]) };
  const args = probeArguments(settings, 'linux');
  assert.equal(args[0], '--ozone-platform=x11');
  assert.match(args[1], /webcodecs-host\.cjs$/);
  assert.deepEqual(JSON.parse(args[2]), settings);
  assert.ok(args.every((arg) => !/no-sandbox|disable-gpu-sandbox|ignore-gpu-blocklist/.test(arg)));
});

for (const platform of ['win32', 'darwin']) {
  test(`${platform} diagnostic retains its default platform backend`, () => {
    const args = probeArguments({ input: 'cpu' }, platform);
    assert.equal(args.length, 2);
    assert.match(args[0], /webcodecs-host\.cjs$/);
    assert.deepEqual(JSON.parse(args[1]), { input: 'cpu' });
  });
}

const settings = { profile: parseProfile([]), input: 'gpu', acceleration: 'prefer-hardware' };

test('diagnostic accepts a complete encoded result and rejects incomplete frame counts', () => {
  const payload = { status: 'encoded', packets: 30, submittedFrames: 30, bytes: 1200, error: null };
  const outcome = (value) => ({ status: 0, stdout: `BEAM_WEBCODECS_RESULT=${JSON.stringify(value)}` });
  assert.equal(readProbeResult(outcome(payload), settings).status, 'encoded');
  assert.equal(readProbeResult(outcome({ ...payload, packets: 29 }), settings).status, 'host-failed');
  assert.equal(readProbeResult(outcome({ ...payload, submittedFrames: 29 }), settings).status, 'host-failed');
  assert.equal(readProbeResult(outcome({ ...payload, error: 'Encoding error' }), settings).status, 'host-failed');
});

test('diagnostic keeps packet counts and native GPU crashes in a completed report', () => {
  const payload = {
    status: 'failed',
    packets: 0,
    bytes: 0,
    error: 'Encoding error',
    gpuCrashes: [{ reason: 'crashed', exitCode: 133 }],
  };
  const result = readProbeResult(
    {
      status: 0,
      signal: null,
      stdout: `Other log\nBEAM_WEBCODECS_RESULT=${JSON.stringify(payload)}\n`,
      stderr: 'Warning\n[ERROR:native] buffer failure\n',
    },
    settings,
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.packets, 0);
  assert.deepEqual(result.gpuCrashes, payload.gpuCrashes);
  assert.equal(result.diagnostics, '[ERROR:native] buffer failure');
  assert.equal(result.acceleration, 'prefer-hardware');
});

test('diagnostic treats missing, malformed and terminated hosts as failures', () => {
  for (const stdout of [
    '',
    'BEAM_WEBCODECS_RESULT={',
    'unrelated output',
    'BEAM_WEBCODECS_RESULT="encoded"',
    'BEAM_WEBCODECS_RESULT={"status":"invented","packets":0,"bytes":0}',
    'BEAM_WEBCODECS_RESULT={"status":"encoded","packets":0,"bytes":0}',
  ]) {
    assert.equal(readProbeResult({ status: 0, stdout }, settings).status, 'host-failed');
  }
  const result = readProbeResult(
    {
      status: null,
      signal: 'SIGKILL',
      error: new Error('Timed out'),
      stdout: 'BEAM_WEBCODECS_RESULT={"status":"encoded"}',
    },
    settings,
  );
  assert.equal(result.status, 'host-failed');
  assert.equal(result.hostError, 'Timed out');
  assert.equal(result.hostSignal, 'SIGKILL');
});

test('diagnostic bounds native error output and preserves exit codes', () => {
  const stderr = Array.from({ length: 30 }, (_, index) => `[ERROR:gpu] ${index}: ${'x'.repeat(1000)}`).join('\n');
  const result = readProbeResult({ status: 2, stderr }, settings);
  assert.equal(result.hostExitCode, 2);
  assert.ok(result.diagnostics.length <= 4000);
  assert.match(result.diagnostics, /29:/);
  assert.doesNotMatch(result.diagnostics, /0:/);
});
