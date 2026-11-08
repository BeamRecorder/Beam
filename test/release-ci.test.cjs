const assert = require('node:assert/strict');
const test = require('node:test');
const { requireSuccessfulCi } = require('../scripts/release/require-ci.cjs');
const sha = 'a'.repeat(40);
const repository = 'BeamRecorder/Beam';
const success = { databaseId: 42, headSha: sha, status: 'completed', conclusion: 'success' };

test('requires CI from the release commit and the CI workflow before proceeding', async () => {
  const calls = [];
  const execute = (args) => {
    calls.push(args);
    return JSON.stringify(args[1] === 'list' ? [success] : success);
  };
  assert.equal(await requireSuccessfulCi({ repository, sha, execute }), 42);
  assert.ok(calls[0].includes('ci.yml'));
  assert.equal(calls[0][calls[0].indexOf('--commit') + 1], sha);
  assert.equal(
    calls.some((args) => args[1] === 'watch'),
    false,
  );
});
test('waits for a queued CI run then verifies its terminal state and SHA', async () => {
  const calls = [];
  const execute = (args) => {
    calls.push(args);
    return JSON.stringify(args[1] === 'list' ? [{ ...success, status: 'queued' }] : success);
  };
  assert.equal(await requireSuccessfulCi({ repository, sha, execute }), 42);
  assert.ok(calls.find((args) => args[1] === 'watch').includes('--exit-status'));
  assert.equal(calls.at(-1)[1], 'view');
});
test('never accepts success from a previous commit', async () => {
  await assert.rejects(
    requireSuccessfulCi({
      repository,
      sha,
      attempts: 1,
      execute: () => JSON.stringify([{ ...success, headSha: 'b'.repeat(40) }]),
    }),
    /No CI run found/,
  );
});
test('retries a not-yet-created CI run within a bounded deadline', async () => {
  let attempts = 0,
    sleeps = 0;
  const execute = (args) => JSON.stringify(args[1] === 'list' ? (++attempts === 1 ? [] : [success]) : success);
  assert.equal(
    await requireSuccessfulCi({
      repository,
      sha,
      execute,
      pause: async (ms) => {
        assert.equal(ms, 15000);
        sleeps += 1;
      },
    }),
    42,
  );
  assert.equal(sleeps, 1);
});
for (const conclusion of ['failure', 'cancelled', 'skipped'])
  test(`rejects a ${conclusion} CI run`, async () => {
    const result = { ...success, conclusion };
    await assert.rejects(
      requireSuccessfulCi({
        repository,
        sha,
        execute: (args) => JSON.stringify(args[1] === 'list' ? [result] : result),
      }),
      /CI must succeed/,
    );
  });
test('propagates a failed live CI watch', async () => {
  await assert.rejects(
    requireSuccessfulCi({
      repository,
      sha,
      execute: (args) => {
        if (args[1] === 'watch') throw new Error('CI failed');
        return JSON.stringify([{ ...success, status: 'in_progress' }]);
      },
    }),
    /CI failed/,
  );
});
test('rejects missing commit identity before running a CLI command', async () => {
  await assert.rejects(requireSuccessfulCi({ repository, sha: '' }), /exact commit SHA/);
});
