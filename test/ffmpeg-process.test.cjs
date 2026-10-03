const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startProcess } = require('@beam/electron-export/ffmpeg-process');
function fixture(timeoutMs = 1000) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = [];
  child.kill = (signal) => {
    child.killed.push(signal);
    child.emit('close', null, signal);
  };
  const process = startProcess('/native', ['a'], { timeoutMs, spawnImpl: () => child });
  return { child, ...process };
}
test('recognizes readiness across chunks and returns native diagnostics after success', async () => {
  const process = fixture();
  process.child.stdout.emit('data', 'BEAM_FFMPEG_');
  process.child.stdout.emit('data', 'READY\n');
  await process.ready;
  process.child.stdout.emit('data', 'result');
  process.child.emit('close', 0);
  assert.match((await process.completion).stdout, /result/);
  process.cancel();
  assert.deepEqual(process.child.killed, []);
});
test('bounds process output and surfaces spawn or native encoding failures', async () => {
  const process = fixture();
  process.child.stderr.emit('data', 'x'.repeat(20000));
  process.child.stderr.emit('data', 'GPU unavailable');
  process.child.emit('close', 1);
  await assert.rejects(
    process.completion,
    (error) => error.message.length < 17000 && error.message.includes('GPU unavailable'),
  );
  await assert.rejects(process.ready, /GPU unavailable/);
  const missing = fixture();
  missing.child.emit('error', new Error('ENOENT'));
  await assert.rejects(missing.completion, /ENOENT/);
  missing.child.emit('close', 1);
});
test('kills timed out and cancelled owned processes and rejects missing readiness', async () => {
  const timed = fixture(5);
  const keepAlive = setTimeout(() => {}, 20);
  await assert.rejects(timed.completion, /SIGKILL/);
  clearTimeout(keepAlive);
  assert.deepEqual(timed.child.killed, ['SIGKILL']);
  const cancelled = fixture();
  cancelled.cancel();
  await assert.rejects(cancelled.completion, /SIGKILL/);
  const done = fixture();
  done.child.emit('close', 0);
  await done.completion;
  await assert.rejects(done.ready, /before becoming ready/);
});
