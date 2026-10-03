import { gsap } from 'gsap';
import sentence from '../components/sentence.html?raw';
import field from '../components/input-field.html?raw';
import cursor from '../components/cursor.html?raw';
import zoom from '../components/zoom.html?raw';
import { mountTemplate } from '../components/mount.js';
import { createTypingTrack } from '../components/typing.js';
import { createCursorTrack } from '../components/cursor.js';
import { createZoomTrack } from '../components/zoom.js';
import { content } from './content.js';
import '../components/styles.css';
import './styles.css';

const root = document.querySelector('#launch-demo');
const viewport = mountTemplate(root.querySelector('#camera-mount'), zoom);
const stage = viewport.querySelector('[data-zoom-stage]');
stage.innerHTML = content;
const intro = mountTemplate(stage.querySelector('.sentence-mount'), sentence);
const prompt = mountTemplate(stage.querySelector('.prompt-mount'), field);
const outro = mountTemplate(stage.querySelector('.closing-sentence'), sentence);
// Cursor and interface share the same camera, so clicks stay attached during zooms.
stage.append(root.querySelector('#cursor-mount'));
const pointer = mountTemplate(root.querySelector('#cursor-mount'), cursor);
const type = (element, phrases, hideCaretWhenDone = false) =>
  createTypingTrack(element.querySelector('[data-typing-text]'), element.querySelector('[data-typing-caret]'), {
    phrases,
    hideCaretWhenDone,
    blinkMs: 450,
  });

const tracks = [
  type(intro, [
    { startMs: 100, durationMs: 500, text: 'One idea.' },
    { startMs: 1100, durationMs: 600, text: 'Make it move.' },
  ]),
  type(prompt, [{ startMs: 2300, durationMs: 1050, text: 'Turn my next idea into a launch video.' }]),
  type(outro, [{ startMs: 9600, durationMs: 700, text: 'Made to move.' }], true),
  createCursorTrack(gsap, pointer, {
    size: 68,
    points: [
      { timeMs: 0, x: 1600, y: 950, kind: 'arrow' },
      { timeMs: 2350, x: 1590, y: 780, kind: 'arrow' },
      { timeMs: 3400, x: 1437, y: 341, kind: 'pointer' },
      { timeMs: 3750, x: 1437, y: 341, kind: 'pointer' },
      { timeMs: 4200, x: 1390, y: 650, kind: 'arrow' },
      { timeMs: 5300, x: 950, y: 510, kind: 'pointer' },
      { timeMs: 6700, x: 1430, y: 610, kind: 'arrow' },
      { timeMs: 8500, x: 1790, y: 960, kind: 'arrow' },
    ],
    clicks: [3550, 5400],
  }),
  createZoomTrack(gsap, stage, {
    width: 1920,
    height: 1080,
    keyframes: [
      { timeMs: 0, scale: 1 },
      { timeMs: 1700, scale: 1.06 },
      { timeMs: 2300, scale: 1 },
      { timeMs: 3400, scale: 1.18, focusX: 0.65, focusY: 0.44 },
      { timeMs: 4300, scale: 1, rotateY: -3 },
      { timeMs: 5400, scale: 1.38, focusX: 0.49, focusY: 0.63 },
      { timeMs: 6400, scale: 1.12, rotateY: 4 },
      { timeMs: 7400, scale: 1.3, focusX: 0.72, focusY: 0.63 },
      { timeMs: 8900, scale: 1 },
      { timeMs: 9800, scale: 1.04 },
      { timeMs: 12000, scale: 1 },
    ],
  }),
];

// Choreography uses the same paused clock as text, cursor and camera.
const timeline = gsap.timeline({ paused: true });
timeline
  .set('.opening', { autoAlpha: 1 }, 0)
  .set('.workbench,.closing,.results', { autoAlpha: 0 }, 0)
  .fromTo('.opening', { y: 35, scale: 0.95 }, { y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }, 0)
  .to('.opening', { y: -240, scale: 1.3, autoAlpha: 0, duration: 0.42, ease: 'power3.in' }, 1.75)
  .fromTo(
    '.workbench',
    { autoAlpha: 0, y: 300, scale: 0.7 },
    { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' },
    1.9,
  )
  .to('[data-send]', { scale: 0.85, duration: 0.07 }, 3.55)
  .to('[data-send]', { scale: 1, duration: 0.16, ease: 'back.out(1.4)' }, 3.62)
  .set('.results', { autoAlpha: 1 }, 3.8)
  .fromTo(
    '.result',
    { y: 120, scale: 0.85, autoAlpha: 0 },
    { y: 0, scale: 1, autoAlpha: 1, duration: 0.4, stagger: 0.1, ease: 'power3.out' },
    3.8,
  )
  .fromTo('.capture-art i', { scaleY: 0.4 }, { scaleY: 1, duration: 0.6, stagger: 0.06, ease: 'power3.out' }, 4.2)
  .to('.create-art', { rotation: 90, duration: 0.75, ease: 'power3.inOut' }, 5.45)
  .to('.ship-art span', { x: 25, y: -25, duration: 0.5, ease: 'power3.out' }, 7.2)
  .to('.workbench', { scale: 0.7, y: -120, autoAlpha: 0, duration: 0.5, ease: 'power3.inOut' }, 8.8)
  .fromTo(
    '.closing',
    { autoAlpha: 0, y: 100, scale: 0.9 },
    { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' },
    9.15,
  )
  .fromTo('.closing p', { y: 25, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4 }, 10.35)
  .to(pointer, { autoAlpha: 0, duration: 0.25 }, 8.7);

function seek(timeMs) {
  if (!Number.isFinite(timeMs)) throw new Error('Composition time must be finite.');
  const time = Math.max(0, Math.min(12000, timeMs));
  tracks.forEach((track) => track.seek(time));
  timeline.time(time / 1000, false);
}
const ready = Promise.all([
  document.fonts.ready,
  ...tracks.map((track) => track.ready),
  ...[...root.querySelectorAll('img')].map((image) => image.decode()),
]);
window.beamComposition = {
  ready,
  seek,
  dispose() {
    tracks.forEach((track) => track.dispose?.());
    timeline.kill();
  },
};
window.__timelines = { 'beam-launch-templates': timeline };
seek(0);
