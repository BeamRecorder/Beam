import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import gsapPackage from 'gsap/dist/gsap.js';
import { mountTemplate } from '../components/mount.js';
import { createTypingTrack } from '../components/typing.js';
import { createCursorTrack, MACOS_CURSORS } from '../components/cursor.js';
import { createZoomTrack } from '../components/zoom.js';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
dom.window.HTMLImageElement.prototype.decode = async () => undefined;
const { gsap } = gsapPackage;
const fragment = (name) => readFileSync(new URL(`../components/${name}.html`, import.meta.url), 'utf8');
const mount = (name) => mountTemplate(document.body, fragment(name));
const typing = (phrases, options = {}) => {
  const root = mount('sentence');
  const text = root.querySelector('[data-typing-text]'),
    caret = root.querySelector('[data-typing-caret]');
  return { root, text, caret, track: createTypingTrack(text, caret, { phrases, ...options }) };
};
afterEach(() => {
  gsap.globalTimeline.clear();
  gsap.ticker.sleep();
  document.body.replaceChildren();
});

test('fragments mount one reusable root without replacing adjacent content', () => {
  for (const name of ['sentence', 'input-field', 'cursor', 'zoom']) assert.ok(mount(name));
  assert.equal(document.body.children.length, 4);
});
test('mount rejects ambiguous empty or multi-root fragments', () => {
  for (const markup of ['', '<span></span><span></span>'])
    assert.throws(() => mountTemplate(document.body, markup), /one root/);
});
test('two mounted fields retain independent text and accessible read-only semantics', () => {
  const first = mount('input-field'),
    second = mount('input-field');
  first.querySelector('[data-typing-text]').textContent = 'First';
  assert.equal(second.querySelector('[data-typing-text]').textContent, '');
  assert.equal(first.querySelector('[role="textbox"]').getAttribute('aria-readonly'), 'true');
  assert.equal(first.querySelector('button').getAttribute('aria-label'), 'Send prompt');
});
test('typing produces identical text and caret after forward and reverse seeks', () => {
  const { track, text, caret } = typing([{ startMs: 100, durationMs: 800, text: 'Beam moves.' }]);
  assert.equal(track.seek(50), '');
  assert.equal(caret.style.opacity, '0');
  track.seek(500);
  const snapshot = text.textContent + caret.style.opacity;
  track.seek(5000);
  track.seek(0);
  track.seek(500);
  assert.equal(text.textContent + caret.style.opacity, snapshot);
});
test('typing preserves emoji graphemes and treats markup as plain text', () => {
  const { track, text } = typing([{ startMs: 0, durationMs: 100, text: '👨‍👩‍👧‍👦!' }]);
  assert.equal(track.seek(50), '👨‍👩‍👧‍👦');
  const other = typing([{ startMs: 0, durationMs: 0, text: '<img src=x>' }]);
  assert.equal(other.text.textContent, '<img src=x>');
  assert.equal(other.root.querySelector('img'), null);
  assert.equal(text.children.length, 0);
});
test('phrase replacement and caret blinking use absolute source time', () => {
  const { track, caret } = typing(
    [
      { startMs: 100, durationMs: 100, text: 'First' },
      { startMs: 900, durationMs: 100, text: 'Second' },
    ],
    { blinkMs: 200 },
  );
  assert.equal(track.seek(900), '');
  assert.equal(track.seek(1100), 'Second');
  assert.equal(caret.style.opacity, '0');
  track.seek(1300);
  assert.equal(caret.style.opacity, '1');
  assert.equal(track.seek(200), 'First');
});
test('native field typing changes value and can hide the finished caret', () => {
  const input = document.createElement('textarea'),
    caret = document.createElement('i');
  const track = createTypingTrack(input, caret, {
    phrases: [{ startMs: 0, durationMs: 100, text: 'Done.' }],
    hideCaretWhenDone: true,
  });
  track.seek(100);
  assert.equal(input.value, 'Done.');
  assert.equal(caret.style.opacity, '0');
});
test('typing rejects missing nodes, unordered phrases, invalid duration and nonfinite clocks', () => {
  const valid = [{ startMs: 0, durationMs: 100, text: 'Hello' }];
  assert.throws(() => createTypingTrack(null, null, { phrases: valid }), /requires/);
  for (const phrases of [[], [{ ...valid[0], startMs: -1 }], [{ ...valid[0], durationMs: NaN }], [valid[0], valid[0]]])
    assert.throws(() => typing(phrases));
  assert.throws(() => typing(valid, { blinkMs: 0 }));
  assert.throws(() => typing(valid).track.seek(NaN), /finite/);
});

const cursorPoints = [
  { timeMs: 0, x: 100, y: 100, kind: 'arrow' },
  { timeMs: 1000, x: 900, y: 500, kind: 'pointer' },
  { timeMs: 1500, x: 900, y: 500, kind: 'pointer' },
];
test('cursor decodes every real glyph and switches at its source timestamp', async () => {
  const root = mount('cursor');
  const track = createCursorTrack(gsap, root, { points: cursorPoints, clicks: [1200], size: 64 });
  await track.ready;
  const glyph = root.querySelector('img');
  track.seek(1000);
  assert.equal(glyph.src, MACOS_CURSORS.pointer.url);
  assert.equal(glyph.style.left, '-24px');
  assert.equal(glyph.style.top, '-20px');
  track.seek(0);
  assert.equal(glyph.src, MACOS_CURSORS.arrow.url);
  track.dispose();
});
test('cursor reverse seeks restore position, click scale and ring independently', () => {
  const root = mount('cursor');
  const track = createCursorTrack(gsap, root, { points: cursorPoints, clicks: [1200] });
  track.seek(1250);
  const snapshot = root.innerHTML + root.style.cssText;
  track.seek(1700);
  track.seek(0);
  track.seek(1250);
  assert.equal(root.innerHTML + root.style.cssText, snapshot);
  assert.equal(gsap.getProperty(root, 'x'), 900);
  assert.ok(gsap.getProperty(root.querySelector('img'), 'scaleX') < 1);
  track.seek(0);
  assert.equal(root.querySelector('[data-cursor-ring]').style.opacity, '0');
  track.dispose();
});
test('cursor fails explicitly on unknown glyphs, malformed paths, missing markup and invalid clocks', () => {
  const root = mount('cursor');
  for (const points of [
    [],
    [{ ...cursorPoints[0], kind: 'unknown' }],
    [cursorPoints[0], cursorPoints[0]],
    [{ ...cursorPoints[0], x: NaN }],
  ])
    assert.throws(() => createCursorTrack(gsap, root, { points }));
  assert.throws(() => createCursorTrack(gsap, root, { points: cursorPoints, clicks: [-1] }));
  assert.throws(() => createCursorTrack(gsap, document.createElement('div'), { points: cursorPoints }));
  const track = createCursorTrack(gsap, root, { points: cursorPoints });
  assert.throws(() => track.seek(Infinity), /finite/);
  track.dispose();
});

const zoomFrames = [
  { timeMs: 0, scale: 1 },
  { timeMs: 1000, scale: 2, focusX: 0.75, focusY: 0.25, rotateY: 4 },
];
test('zoom centers the normalized source focus without changing viewport geometry', () => {
  const viewport = mount('zoom'),
    stage = viewport.firstElementChild;
  const track = createZoomTrack(gsap, stage, { width: 1920, height: 1080, keyframes: zoomFrames });
  track.seek(1000);
  assert.equal(gsap.getProperty(stage, 'x'), -960);
  assert.equal(gsap.getProperty(stage, 'y'), 540);
  assert.equal(gsap.getProperty(stage, 'scaleX'), 2);
  assert.equal(gsap.getProperty(stage, 'rotationY'), 4);
  assert.equal(viewport.style.transform, '');
  track.dispose();
});
test('zoom restores intermediate 3D camera poses after reverse seeks and preserves holds', () => {
  const stage = mount('zoom').firstElementChild;
  const frames = [...zoomFrames, { ...zoomFrames[1], timeMs: 1500 }, { timeMs: 2000, scale: 1 }];
  const track = createZoomTrack(gsap, stage, { width: 1920, height: 1080, keyframes: frames });
  track.seek(550);
  const pose = stage.style.cssText;
  track.seek(2000);
  track.seek(0);
  track.seek(550);
  assert.equal(stage.style.cssText, pose);
  track.seek(1200);
  assert.equal(gsap.getProperty(stage, 'scaleX'), 2);
  track.dispose();
});
test('zoom rejects nonfinite dimensions, scales, focus, ordering and source times', () => {
  const stage = mount('zoom').firstElementChild;
  const valid = { width: 1920, height: 1080, keyframes: zoomFrames };
  for (const options of [
    { ...valid, width: 0 },
    { ...valid, perspective: -1 },
    { ...valid, keyframes: [] },
    { ...valid, keyframes: [{ timeMs: 0, scale: 0 }] },
    { ...valid, keyframes: [{ timeMs: 0, scale: 1, focusX: 2 }] },
    { ...valid, keyframes: [zoomFrames[0], zoomFrames[0]] },
  ])
    assert.throws(() => createZoomTrack(gsap, stage, options));
  assert.throws(() => createZoomTrack(gsap, null, valid));
  const track = createZoomTrack(gsap, stage, valid);
  assert.throws(() => track.seek(NaN), /finite/);
  track.dispose();
});
