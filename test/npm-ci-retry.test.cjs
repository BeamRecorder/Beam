const assert = require('node:assert/strict');
const test = require('node:test');

const { runNpmCi } = require('../scripts/ci/npm-ci-retry.cjs');

function fixture(statuses, options = {}) {
  const calls = [];
  const delays = [];
  const logs = [];
  let index = 0;
  const spawn = (command, args, spawnOptions) => {
    calls.push({ command, args, spawnOptions });
    const status = statuses[Math.min(index++, statuses.length - 1)];
    return typeof status === 'object' ? status : { status };
  };

  return {
    calls,
    delays,
    logs,
    run: () =>
      runNpmCi({
        spawn,
        pause: (delay) => delays.push(delay),
        log: (message) => logs.push(message),
        ...options,
      }),
  };
}

test('returns after the first successful npm ci attempt', () => {
  const fixtureState = fixture([0]);

  fixtureState.run();

  assert.equal(fixtureState.calls.length, 1);
  assert.deepEqual(fixtureState.calls[0], {
    command: 'npm',
    args: ['ci'],
    spawnOptions: { stdio: 'inherit' },
  });
  assert.deepEqual(fixtureState.delays, []);
  assert.deepEqual(fixtureState.logs, ['[CI] npm ci attempt 1/3']);
});

test('retries a failed npm ci and uses the expected backoff delays', () => {
  const fixtureState = fixture([1, 1, 0]);

  fixtureState.run();

  assert.equal(fixtureState.calls.length, 3);
  assert.deepEqual(fixtureState.delays, [5_000, 15_000]);
  assert.deepEqual(fixtureState.logs, [
    '[CI] npm ci attempt 1/3',
    '[CI] npm ci failed; retrying in 5s',
    '[CI] npm ci attempt 2/3',
    '[CI] npm ci failed; retrying in 15s',
    '[CI] npm ci attempt 3/3',
  ]);
});

test('selects npm.cmd on Windows runners', () => {
  const fixtureState = fixture([0], { platform: 'win32' });

  fixtureState.run();

  assert.equal(fixtureState.calls[0].command, 'npm.cmd');
  assert.deepEqual(fixtureState.calls[0].spawnOptions, {
    stdio: 'inherit',
    shell: true,
  });
});

test('keeps the Windows shell when retrying npm ci', () => {
  const fixtureState = fixture([1, 0], { platform: 'win32' });

  fixtureState.run();

  assert.deepEqual(fixtureState.delays, [5_000]);
  assert.equal(fixtureState.calls.length, 2);
  assert.deepEqual(
    fixtureState.calls.map(({ command, spawnOptions }) => ({ command, spawnOptions })),
    [
      { command: 'npm.cmd', spawnOptions: { stdio: 'inherit', shell: true } },
      { command: 'npm.cmd', spawnOptions: { stdio: 'inherit', shell: true } },
    ],
  );
});

test('fails after the configured three attempts and does not pause again', () => {
  const fixtureState = fixture([1, 1, 1]);

  assert.throws(fixtureState.run, /npm ci failed after 3 attempts/);
  assert.equal(fixtureState.calls.length, 3);
  assert.deepEqual(fixtureState.delays, [5_000, 15_000]);
});

test('surfaces a spawn error without retrying a missing npm executable', () => {
  const spawnError = new Error('npm executable not found');
  const fixtureState = fixture([{ error: spawnError }]);

  assert.throws(fixtureState.run, spawnError);
  assert.equal(fixtureState.calls.length, 1);
  assert.deepEqual(fixtureState.delays, []);
});
