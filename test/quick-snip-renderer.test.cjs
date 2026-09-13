const assert = require('node:assert/strict');
const test = require('node:test');
const { createQuickSnipRenderer } = require('../electron/quick-snip/quick-snip-renderer.cjs');
function fixture() {
  const handlers = new Map(),
    sender = {},
    saved = [],
    progress = [];
  let task;
  const renderer = createQuickSnipRenderer({
    applicationIpc: { handle: (name, fn) => handlers.set(name, fn) },
    statusWindow: {
      owns: (value) => value === sender,
      setRenderTask: (value) => {
        task = value;
      },
    },
  });
  const abort = new AbortController();
  const result = renderer.render({
    configuration: { projectId: 'project', mode: 'studio', format: 'mp4' },
    store: { editorData: () => ({}), editorState: () => ({}), saveEditorState: (...args) => saved.push(args) },
    target: '/output.mp4',
    signal: abort.signal,
    onProgress: (...args) => progress.push(args),
  });
  return {
    renderer,
    result,
    abort,
    saved,
    progress,
    sender,
    task: () => task,
    invoke: (name, payload, owner = sender) => handlers.get(`quick-snip:${name}`)({ sender: owner }, payload),
  };
}
test('authorizes only the status sender and validates the output format', async () => {
  const f = fixture();
  assert.equal(f.invoke('render-task', null, {}), null);
  assert.equal(f.renderer.destination({}, 'mp4'), null);
  assert.throws(() => f.renderer.destination(f.sender, 'webm'), /No Quick Snip/);
  assert.equal(f.renderer.destination(f.sender, 'mp4'), '/output.mp4');
  assert.throws(
    () => f.invoke('render-report', { id: f.task().id, type: 'completed', path: '/output.mp4' }, {}),
    /authorized/,
  );
  f.abort.abort();
  await assert.rejects(f.result, { name: 'AbortError' });
});
test('forwards bounded progress and saves the generated editor state', async () => {
  const f = fixture(),
    id = f.task().id;
  f.invoke('render-state', { id, state: { schemaVersion: 3 } });
  f.invoke('render-report', { id, type: 'progress', progress: 0.5, preview: 'data:image/jpeg;base64,YQ==' });
  assert.deepEqual(f.saved, [['project', { schemaVersion: 3 }]]);
  assert.equal(f.progress[0][0], 0.5);
  assert.equal(f.progress[0][1].preview, 'data:image/jpeg;base64,YQ==');
  assert.throws(() => f.invoke('render-report', { id, type: 'progress', progress: NaN }), /Invalid/);
  assert.throws(() => f.invoke('render-report', { id, type: 'completed', path: '/other.mp4' }), /Unexpected/);
  f.invoke('render-report', { id, type: 'completed', path: '/output.mp4' });
  assert.deepEqual(await f.result, { path: '/output.mp4', projectId: 'project' });
  assert.equal(f.task(), null);
});
test('rejects late results after cancellation and propagates render failures', async () => {
  const f = fixture(),
    id = f.task().id;
  f.abort.abort();
  await assert.rejects(f.result, { name: 'AbortError' });
  assert.throws(() => f.invoke('render-report', { id, type: 'completed', path: '/output.mp4' }), /authorized/);
  const next = fixture();
  next.invoke('render-report', { id: next.task().id, type: 'failed', error: 'Codec unavailable' });
  await assert.rejects(next.result, /Codec unavailable/);
});
