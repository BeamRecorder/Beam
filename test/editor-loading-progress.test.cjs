const test = require('node:test');
const assert = require('node:assert/strict');
const { createEditorProgressReporter } = require('../electron/window/editor-loading-progress.cjs');
const setup = () => {
  const calls = [];
  let destroyed = false;
  const session = { lastProgressValue: 0, lastProgressStage: '', lastProgressAt: 0 };
  const report = createEditorProgressReporter(
    { isDestroyed: () => destroyed, webContents: { send: (...args) => calls.push(args) } },
    (candidate) => candidate === session,
  );
  return {
    report,
    calls,
    session,
    destroy: () => {
      destroyed = true;
    },
  };
};
test('forwards confirmed progress monotonically for the presenting session', () => {
  const { report, calls, session } = setup();
  assert.equal(report(session, 'openingWindow'), true);
  assert.equal(report(session, 'loadingTimeline'), true);
  assert.equal(report(session, 'loadingProject'), false);
  session.lastProgressAt = 1;
  assert.equal(report(session, 'loadingTimeline'), true);
  assert.equal(session.lastProgressAt, 1);
  assert.equal(report(session, 'ready'), true);
  assert.deepEqual(calls.at(-1), ['editor:loading-progress', { stage: 'ready', value: 100 }]);
  assert.notEqual(session.lastProgressAt, 1);
});
test('rejects unknown, inherited and malformed stage names without mutating progress', () => {
  const { report, calls, session } = setup();
  for (const stage of ['toString', '__proto__', 'constructor', 'unknown', null, undefined, {}, 60])
    assert.equal(report(session, stage), false);
  assert.equal(session.lastProgressValue, 0);
  assert.deepEqual(calls, []);
});
test('does not publish progress from another session or to a destroyed HUD', () => {
  const { report, calls, session, destroy } = setup();
  assert.equal(report({ ...session }, 'loadingTimeline'), false);
  destroy();
  assert.equal(report(session, 'loadingTimeline'), false);
  assert.deepEqual(calls, []);
});
