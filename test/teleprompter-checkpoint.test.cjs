const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createTeleprompterCheckpoint,
  validateTeleprompterViewState,
} = require('../electron/teleprompter/teleprompter-checkpoint.cjs');

const context = {
  projectId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
};
const document = {
  schemaVersion: 1,
  text: 'First line\nSecond line',
  mode: 'line-by-line',
  autoscroll: true,
  scrollSpeed: 70,
  fontSize: 36,
  lineHeight: 1.5,
  textAlign: 'center',
  theme: 'dark',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};
const viewState = {
  document,
  session: context,
  activeLine: 1,
  scrollTop: 180.5,
  isEditing: false,
  isPaused: true,
  error: '',
};

function target() {
  const sent = [];
  return { webContents: { send: (...args) => sent.push(args), sent } };
}

test('normalizes a valid checkpoint and bounds the document values', () => {
  const normalized = validateTeleprompterViewState({
    ...viewState,
    document: { ...document, scrollSpeed: 900, fontSize: 4, lineHeight: 9 },
  });
  assert.deepEqual(normalized.session, context);
  assert.equal(normalized.document.scrollSpeed, 200);
  assert.equal(normalized.document.fontSize, 16);
  assert.equal(normalized.document.lineHeight, 2.5);
  assert.equal(normalized.activeLine, 1);
  assert.equal(normalized.scrollTop, 180.5);
  assert.equal(normalized.isPaused, true);
});

test('rejects invalid checkpoint identities, positions and view-state fields', () => {
  const invalidStates = [
    null,
    { ...viewState, session: { projectId: 'bad', sessionId: context.sessionId } },
    { ...viewState, activeLine: -1 },
    { ...viewState, activeLine: 1.5 },
    { ...viewState, activeLine: 1_000_001 },
    { ...viewState, scrollTop: -1 },
    { ...viewState, scrollTop: Number.NaN },
    { ...viewState, scrollTop: 1_000_000_001 },
    { ...viewState, isEditing: 'false' },
    { ...viewState, isPaused: 0 },
    { ...viewState, error: 'x'.repeat(10_001) },
    { ...viewState, document: { ...document, schemaVersion: 2 } },
  ];
  for (const state of invalidStates) assert.throws(() => validateTeleprompterViewState(state));
});

test('accepts only the pending request owner and id, then resolves one normalized snapshot', async () => {
  const checkpoint = createTeleprompterCheckpoint();
  const owner = target();
  const other = target();
  const pending = checkpoint.request(owner);
  const [channel, requestId] = owner.webContents.sent[0];

  assert.equal(channel, 'teleprompter:suspend');
  assert.match(requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(checkpoint.request(other), pending, 'overlapping requests reuse the same checkpoint transaction');
  assert.equal(checkpoint.acknowledge(other.webContents, requestId, viewState), false);
  assert.equal(checkpoint.acknowledge(owner.webContents, '00000000-0000-4000-8000-000000000000', viewState), false);
  assert.equal(checkpoint.acknowledge(owner.webContents, requestId, viewState), true);
  assert.deepEqual(await pending, viewState);
  assert.equal(checkpoint.acknowledge(owner.webContents, requestId, viewState), false);
});

test('clears a failed suspend send so a later request can checkpoint its own renderer', async () => {
  const checkpoint = createTeleprompterCheckpoint();
  const sendError = new Error('renderer is gone');
  const brokenTarget = {
    webContents: {
      send: () => {
        throw sendError;
      },
    },
  };

  const failedRequest = checkpoint.request(brokenTarget);
  await assert.rejects(failedRequest, sendError);

  const retryTarget = target();
  const retryRequest = checkpoint.request(retryTarget);
  const [, retryId] = retryTarget.webContents.sent[0];
  assert.equal(checkpoint.acknowledge(retryTarget.webContents, retryId, viewState), true);
  assert.deepEqual(await retryRequest, viewState);
});

test('rejects malformed acknowledgements instead of returning an unchecked snapshot', async () => {
  const checkpoint = createTeleprompterCheckpoint();
  const owner = target();
  const pending = checkpoint.request(owner);
  const [, requestId] = owner.webContents.sent[0];

  assert.equal(checkpoint.acknowledge(owner.webContents, requestId, { ...viewState, scrollTop: -1 }), true);
  await assert.rejects(pending, /Invalid teleprompter checkpoint state/);
});

test('rejects a checkpoint that receives no renderer acknowledgement before its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const checkpoint = createTeleprompterCheckpoint();
  const pending = checkpoint.request(target());
  t.mock.timers.tick(2_000);
  await assert.rejects(pending, /renderer was retained to preserve the draft/);
});

test('cancels a pending checkpoint and ignores its late acknowledgement before a fresh request', async () => {
  const checkpoint = createTeleprompterCheckpoint();
  const oldOwner = target();
  const newOwner = target();
  const oldPending = checkpoint.request(oldOwner);
  const [, oldId] = oldOwner.webContents.sent[0];

  checkpoint.cancel();
  assert.equal(await oldPending, null);
  assert.equal(checkpoint.acknowledge(oldOwner.webContents, oldId, viewState), false);

  const newPending = checkpoint.request(newOwner);
  const [, newId] = newOwner.webContents.sent[0];
  assert.notEqual(newId, oldId);
  assert.equal(checkpoint.acknowledge(oldOwner.webContents, newId, viewState), false);
  assert.equal(checkpoint.acknowledge(newOwner.webContents, newId, viewState), true);
  assert.deepEqual(await newPending, viewState);
});
