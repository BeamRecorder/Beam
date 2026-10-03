const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveCargoTargetDirectory } = require('@beam/native-client/cargo-build-paths');
test('resolves Cargo configuration without guessing a worktree-local target directory', () => {
  let invocation;
  const directory = resolveCargoTargetDirectory('/worktree', (command, args, options) => {
    invocation = { command, args, options };
    return {
      status: 0,
      stdout: JSON.stringify({ target_directory: '/cache/cargo target' }),
    };
  });
  assert.equal(directory, '/cache/cargo target');
  assert.equal(invocation.command, 'cargo');
  assert.deepEqual(invocation.args, ['metadata', '--no-deps', '--format-version', '1']);
  assert.equal(invocation.options.cwd, '/worktree');
  assert.equal(invocation.options.timeout, 10000);
});
test('reports Cargo process and configuration errors', () => {
  assert.throws(
    () =>
      resolveCargoTargetDirectory('/worktree', () => ({
        error: new Error('Cargo missing'),
      })),
    /Cargo missing/,
  );
  assert.throws(
    () =>
      resolveCargoTargetDirectory('/worktree', () => ({
        status: 101,
        stderr: 'Bad Cargo configuration',
      })),
    /Bad Cargo configuration/,
  );
  assert.throws(() => resolveCargoTargetDirectory('/worktree', () => ({ status: 2 })), /Cargo metadata failed: 2/);
});
test('rejects malformed metadata and nonabsolute build directories', () => {
  for (const stdout of [
    'invalid json',
    'null',
    '{}',
    '{"target_directory":null}',
    '{"target_directory":"relative/target"}',
  ]) {
    assert.throws(() => resolveCargoTargetDirectory('/worktree', () => ({ status: 0, stdout })));
  }
});
