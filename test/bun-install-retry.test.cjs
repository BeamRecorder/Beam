const assert = require('node:assert/strict');
const test = require('node:test');

const { runBunInstall } = require('../scripts/ci/bun-install-retry.cjs');

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
      runBunInstall({
        spawn,
        pause: (delay) => delays.push(delay),
        log: (message) => logs.push(message),
        ...options,
      }),
  };
}

test('returns after the first successful Bun install attempt', () => {
  const fixtureState = fixture([0]);

  fixtureState.run();

  assert.equal(fixtureState.calls.length, 1);
  assert.deepEqual(fixtureState.calls[0], {
    command: 'bun',
    args: ['install', '--frozen-lockfile'],
    spawnOptions: { stdio: 'inherit' },
  });
  assert.deepEqual(fixtureState.delays, []);
  assert.deepEqual(fixtureState.logs, ['[CI] bun install attempt 1/3']);
});

test('retries a failed Bun install and uses the expected backoff delays', () => {
  const fixtureState = fixture([1, 1, 0]);

  fixtureState.run();

  assert.equal(fixtureState.calls.length, 3);
  assert.deepEqual(fixtureState.delays, [5_000, 15_000]);
  assert.deepEqual(fixtureState.logs, [
    '[CI] bun install attempt 1/3',
    '[CI] bun install failed; retrying in 5s',
    '[CI] bun install attempt 2/3',
    '[CI] bun install failed; retrying in 15s',
    '[CI] bun install attempt 3/3',
  ]);
});

test('selects bun.exe on Windows runners', () => {
  const fixtureState = fixture([0], { platform: 'win32' });

  fixtureState.run();

  assert.equal(fixtureState.calls[0].command, 'bun.exe');
  assert.deepEqual(fixtureState.calls[0].spawnOptions, {
    stdio: 'inherit',
    shell: true,
  });
});

test('keeps the Windows shell when retrying Bun install', () => {
  const fixtureState = fixture([1, 0], { platform: 'win32' });

  fixtureState.run();

  assert.deepEqual(fixtureState.delays, [5_000]);
  assert.equal(fixtureState.calls.length, 2);
  assert.deepEqual(
    fixtureState.calls.map(({ command, spawnOptions }) => ({ command, spawnOptions })),
    [
      { command: 'bun.exe', spawnOptions: { stdio: 'inherit', shell: true } },
      { command: 'bun.exe', spawnOptions: { stdio: 'inherit', shell: true } },
    ],
  );
});

test('fails after the configured three attempts and does not pause again', () => {
  const fixtureState = fixture([1, 1, 1]);

  assert.throws(fixtureState.run, /bun install failed after 3 attempts/);
  assert.equal(fixtureState.calls.length, 3);
  assert.deepEqual(fixtureState.delays, [5_000, 15_000]);
});

test('surfaces a spawn error without retrying a missing Bun executable', () => {
  const spawnError = new Error('bun executable not found');
  const fixtureState = fixture([{ error: spawnError }]);

  assert.throws(fixtureState.run, spawnError);
  assert.equal(fixtureState.calls.length, 1);
  assert.deepEqual(fixtureState.delays, []);
});
