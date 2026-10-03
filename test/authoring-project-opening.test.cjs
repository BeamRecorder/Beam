const test = require('node:test');
const assert = require('node:assert/strict');
const { openAuthoringProject } = require('../apps/desktop/electron/authoring/project-opening.cjs');

const projectId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const calls = [];
  return {
    calls,
    services: {
      projectStore: { get: (id) => calls.push(['video', id]) },
      screenshotStore: { read: (id) => calls.push(['image', id]) },
      editorWindow: {
        open: async (...args) => {
          calls.push(['open', ...args]);
          return true;
        },
      },
    },
  };
}

for (const kind of ['video', 'image']) {
  test(`${kind} opens separately by default and preserves the native editor kind`, async () => {
    const { calls, services } = fixture();
    assert.deepEqual(await openAuthoringProject({ projectId, kind }, services), {
      projectId,
      kind,
      disposition: 'new-window',
      status: 'opened',
    });
    assert.deepEqual(calls, [
      [kind, projectId],
      ['open', projectId, { disposition: 'new-window', ...(kind === 'image' ? { kind: 'screenshot' } : {}) }],
    ]);
  });
  for (const disposition of ['new-window', 'reuse']) {
    test(`${kind} honors explicit ${disposition}`, async () => {
      const { calls, services } = fixture();
      await openAuthoringProject({ projectId, kind, disposition }, services);
      assert.equal(calls[1][2].disposition, disposition);
    });
  }
}

test('invalid kinds and dispositions cannot read storage or change any editor', async () => {
  const { calls, services } = fixture();
  for (const kind of [undefined, null, 'screenshot', '', 1])
    await assert.rejects(openAuthoringProject({ projectId, kind }, services), /kind/);
  for (const disposition of [null, '', false, 1, {}, 'new-instance'])
    await assert.rejects(openAuthoringProject({ projectId, kind: 'video', disposition }, services), /disposition/);
  assert.deepEqual(calls, []);
});

test('a missing project cannot replace or create an editor', async () => {
  const { calls, services } = fixture();
  services.projectStore.get = () => {
    throw new Error('Missing video');
  };
  services.screenshotStore.read = () => {
    throw new Error('Missing image');
  };
  for (const kind of ['video', 'image'])
    await assert.rejects(openAuthoringProject({ projectId, kind }, services), /Missing/);
  assert.deepEqual(calls, []);
});

test('cancellation is reported without claiming that a project opened', async () => {
  const { services } = fixture();
  services.editorWindow.open = async () => false;
  assert.equal((await openAuthoringProject({ projectId, kind: 'image' }, services)).status, 'cancelled');
});

test('native presentation failures propagate to the CLI', async () => {
  const { services } = fixture();
  services.editorWindow.open = async () => {
    throw new Error('Renderer failed');
  };
  await assert.rejects(openAuthoringProject({ projectId, kind: 'video' }, services), /Renderer failed/);
});
