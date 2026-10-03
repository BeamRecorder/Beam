const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { JSDOM } = require('jsdom');
const {
  htmlPreviewPage,
  htmlPreviewHeaders,
  restrictHtmlPreviewNavigation,
} = require('../apps/desktop/electron/authoring/html-preview-page.cjs');

const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function fixture(t, markup = '', seek = async () => {}) {
  const messages = [],
    target = { postMessage: (message) => messages.push(message) },
    calls = [];
  const dom = new JSDOM(htmlPreviewPage(`<html><head></head><body>${markup}</body></html>`, 'id:rev'), {
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'parent', { value: target });
      Object.defineProperty(window.document, 'fonts', { value: { ready: Promise.resolve() } });
      window.beamComposition = {
        ready: Promise.resolve(),
        seek: (time) => {
          calls.push(time);
          return seek(time);
        },
      };
    },
  });
  t.after(() => dom.window.close());
  const send = (data, source = target) =>
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source,
        data: { channel: 'beam-html-preview', previewId: 'id:rev', type: 'seek', timeMs: 100, ...data },
      }),
    );
  return { dom, calls, messages, send };
}
test('HTML bridge seeks immediately, follows reverse seeks and mutes embedded soundtrack', async (t) => {
  const f = fixture(t, '<audio></audio><video></video>');
  await flush();
  assert.equal(f.messages[0].type, 'ready');
  assert.deepEqual(f.calls, [0]);
  assert.ok([...f.dom.window.document.querySelectorAll('audio,video')].every((media) => media.muted));
  f.send({ timeMs: 12000 });
  await flush();
  f.send({ timeMs: 3000 });
  await flush();
  assert.deepEqual(f.calls, [0, 12000, 3000]);
});
test('HTML bridge coalesces asynchronous seeks to the newest playhead', async (t) => {
  let complete;
  const f = fixture(t, '', (time) =>
    time === 100
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : Promise.resolve(),
  );
  await flush();
  f.send({ timeMs: 100 });
  f.send({ timeMs: 200 });
  f.send({ timeMs: 350 });
  assert.deepEqual(f.calls, [0, 100]);
  complete();
  await flush();
  assert.deepEqual(f.calls, [0, 100, 350]);
});
test('HTML bridge rejects spoofed messages and invalid clocks', async (t) => {
  const f = fixture(t);
  await flush();
  for (const patch of [{ channel: 'other' }, { previewId: 'old' }, { type: 'other' }, { timeMs: -1 }, { timeMs: NaN }])
    f.send(patch);
  f.send({}, f.dom.window);
  await flush();
  assert.deepEqual(f.calls, [0]);
});
test('HTML bridge reports failed seeks without announcing a successful first frame', async (t) => {
  const f = fixture(t, '', async () => {
    throw new Error('animation failed');
  });
  await flush();
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].type, 'error');
  assert.match(f.messages[0].message, /animation failed/);
  f.send({ timeMs: 20 });
  await flush();
  assert.deepEqual(f.calls, [0]);
});
test('HTML bridge reports missing animation adapters and script failures', async (t) => {
  const f = fixture(t, '<script>window.beamComposition={};</script>');
  await flush();
  assert.match(f.messages[0].message, /expose seek/);
  f.dom.window.dispatchEvent(new f.dom.window.ErrorEvent('error', { message: 'syntax error' }));
  assert.equal(f.messages.at(-1).message, 'syntax error');
  const event = new f.dom.window.Event('unhandledrejection');
  event.reason = 'rejected';
  f.dom.window.dispatchEvent(event);
  assert.equal(f.messages.at(-1).message, 'rejected');
});
test('HTML bootstrap precedes inline scripts, works without head and preserves source', () => {
  for (const html of [
    '<head><script>author()</script></head>',
    '<HEAD class="test"><script>author()</script></HEAD>',
    '<script>author()</script>',
  ]) {
    const result = htmlPreviewPage(html, 'id:rev');
    assert.ok(result.indexOf('beam-html-preview') < result.indexOf('author()'));
    assert.ok(result.includes('author()'));
  }
});
test('HTML resources use an opaque sandbox with bundle-only permissions', () => {
  const headers = htmlPreviewHeaders('http://127.0.0.1:10/preview/token/');
  assert.equal(headers['Access-Control-Allow-Origin'], '*');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.match(headers['Content-Security-Policy'], /sandbox allow-scripts$/);
  assert.match(headers['Content-Security-Policy'], /connect-src 'none'; frame-src 'none'/);
  assert.ok(!headers['Content-Security-Policy'].includes('allow-same-origin'));
});
test('preview navigation guard denies frame redirects but preserves the editor and unrelated frames', () => {
  const contents = new EventEmitter();
  restrictHtmlPreviewNavigation(contents, 'http://127.0.0.1:10');
  for (const name of ['will-frame-navigate', 'will-redirect']) {
    let blocked = 0;
    const preventDefault = () => blocked++;
    contents.emit(name, {
      isMainFrame: true,
      frame: { url: 'http://127.0.0.1:10/preview/token/index.html' },
      preventDefault,
    });
    contents.emit(name, { isMainFrame: false, frame: null, preventDefault });
    contents.emit(name, { isMainFrame: false, frame: { url: 'https://other.test' }, preventDefault });
    assert.equal(blocked, 0);
    contents.emit(name, {
      isMainFrame: false,
      frame: { url: 'http://127.0.0.1:10/preview/token/index.html' },
      preventDefault,
    });
    assert.equal(blocked, 1);
  }
});
