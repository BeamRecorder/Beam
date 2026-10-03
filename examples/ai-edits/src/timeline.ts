import { gsap } from 'gsap';
import { BEAT_SECONDS } from './clock';

// The same three official screens stay alive through every camera move.
// All motion belongs to one paused timeline, including the fifteen-second tail.
export function createTimeline(): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });
  tl.set('#gallery, #closing, #announcement, #question, #insight, #vision, #insight-line, #colour-sweep', { opacity: 0 }, 0);
  tl.set('#world', { scale: .95, x: 25, y: 24, rotation: 0 }, 0);
  tl.set('#devices', { opacity: 0 }, 0);
  tl.set('#review', { x: 950, y: 170, scale: .65, rotation: -13, rotationY: 14 }, 0);
  tl.set('#projects', { x: 1210, y: 80, scale: .79, rotation: -4, rotationY: -7 }, 0);
  tl.set('#ideas', { x: 1480, y: 180, scale: .69, rotation: 11, rotationY: -15 }, 0);
  tl.set('#edits-icon', { rotation: -24, rotationY: -12, scale: 1.6, x: 70, y: -30 }, 0);
  tl.to('#world', { scale: 1.04, x: -26, y: -10, duration: 1.75, ease: 'none' }, 0);
  tl.fromTo('.hero-idea', { y: 60, rotation: -3, scale: .86 }, { y: 0, rotation: 0, scale: 1, duration: .9, ease: 'back.out(1.2)' }, 0);
  tl.to('#edits-icon', { rotation: -3, rotationY: 8, scale: 1.08, x: 0, y: 0, duration: 1.65, ease: 'power3.out' }, 0);
  tl.to('#colour-field', { x: -180, rotation: 14, scale: 1.05, duration: 15, ease: 'none' }, 0);

  // The official icon becomes the bridge into the interface, on bar two.
  const reveal = 4 * BEAT_SECONDS;
  tl.to('#hero', { x: -210, y: -70, scale: .87, opacity: 0, duration: .34 }, reveal - .3);
  tl.to('#edits-icon', { scale: 5.5, x: -420, y: -180, rotation: 14, duration: .48, ease: 'power4.in' }, reveal - .35);
  tl.fromTo('#colour-sweep', { x: 1850, rotation: -16, opacity: 1 }, { x: -2350, duration: .74, ease: 'power3.inOut' }, reveal - .16);
  tl.to('#edits-icon', { opacity: 0, duration: .14 }, reveal + .04);
  tl.to('#devices', { opacity: 1, duration: .18 }, reveal + .03);
  tl.to('#world', { x: 0, y: 0, scale: 1, rotation: -1, duration: .7, ease: 'power3.out' }, reveal + .03);
  tl.fromTo('#announcement', { x: -100, y: 140, scale: .8, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: .68, ease: 'power4.out' }, reveal + .07);
  tl.fromTo('#devices', { y: 430, rotation: 9 }, { y: 0, rotation: 0, duration: .78, ease: 'power4.out' }, reveal + .04);
  tl.to('#projects', { y: 48, rotation: -7, duration: 1.2, ease: 'none' }, reveal + .7);
  tl.to('#ideas', { y: 134, rotation: 7, duration: 1.2, ease: 'none' }, reveal + .7);

  // Fly into the actual conversation rather than inventing an assistant UI.
  const ask = 8 * BEAT_SECONDS;
  tl.to('#announcement', { x: -320, opacity: 0, duration: .36 }, ask - .24);
  tl.to('#ideas', { x: 1115, y: 65, scale: 1.02, rotation: 3, rotationY: -8, duration: .66, ease: 'power4.out' }, ask - .05);
  tl.to('#projects', { x: 1590, y: 110, scale: .66, rotation: 16, duration: .63 }, ask - .05);
  tl.to('#review', { x: 1850, y: 260, scale: .7, rotation: 25, duration: .63 }, ask - .05);
  tl.fromTo('#question', { x: -180, y: 100, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: .52, ease: 'power4.out' }, ask + .13);
  tl.to('#ideas', { y: 32, rotation: -1, duration: 1.1, ease: 'none' }, ask + .6);

  const focus = 12 * BEAT_SECONDS;
  tl.to('#world', { scale: 1.9, x: -1340, y: -140, rotation: -2, duration: .68, ease: 'power4.inOut' }, focus - .13);
  tl.to('#question', { scale: .87, x: -30, duration: .68 }, focus - .13);
  tl.to('#ideas', { rotationY: 0, rotation: 0, duration: .55 }, focus - .13);
  tl.to('#world', { y: -225, x: -1370, duration: .95, ease: 'none' }, focus + .55);

  // The pan lands on the official profile analysis. The examples remain credited.
  const insight = 16 * BEAT_SECONDS;
  tl.to('#question', { y: -120, opacity: 0, duration: .31 }, insight - .28);
  tl.to('#ideas', { x: 2450, y: 300, rotation: 15, duration: .67 }, insight - .18);
  tl.to('#projects', { x: 2120, y: 140, rotation: 10, duration: .67 }, insight - .18);
  tl.to('#review', { x: 1000, y: 25, scale: 1, rotation: -3, rotationY: 6, duration: .65 }, insight - .18);
  tl.to('#world', { scale: 1.24, x: -250, y: -115, rotation: 2, duration: .65 }, insight - .18);
  tl.fromTo('#insight', { x: -100, y: 100, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: .55, ease: 'power4.out' }, insight + .04);
  tl.fromTo('#insight-line', { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: .47, ease: 'power4.out' }, insight + .45);
  tl.to('#review', { y: -48, rotation: 0, duration: 1.25, ease: 'none' }, insight + .55);

  // Real photographs from the project gallery cross the lens; no feature cards.
  const gallery = 20 * BEAT_SECONDS;
  tl.to('#insight, #insight-line', { x: -260, opacity: 0, duration: .36 }, gallery - .2);
  tl.to('#world', { scale: 2.1, x: -2900, y: -450, rotation: -8, opacity: 0, duration: .75 }, gallery - .17);
  tl.set('#gallery', { opacity: 1 }, gallery - .1);
  const positions = [
    [80, -90, -16], [390, 560, 10], [810, -160, -9],
    [1120, 595, 13], [1570, -90, -8], [1910, 565, 11],
    [-330, 590, -13], [2350, 80, 8], [760, 750, -6],
  ];
  positions.forEach(([x, y, rotation], index) => {
    tl.fromTo(`.photo-${index}`, { x: x + 1250, y: y - 160, rotation: rotation + 16, scale: .78 },
      { x, y, rotation, scale: 1, duration: .8, ease: 'power4.out' }, gallery - .18 + index * .018);
    tl.to(`.photo-${index}`, { x: x - 240, y: y + 40, rotation: rotation - 4, duration: 1.15, ease: 'none' }, gallery + .8);
  });
  tl.fromTo('#vision', { y: 150, scale: .83, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .58, ease: 'power4.out' }, gallery + .07);
  tl.to('#vision', { x: 30, scale: 1.025, duration: 1.1, ease: 'none' }, gallery + .67);

  const close = 24 * BEAT_SECONDS;
  tl.to('#vision', { scale: 1.45, x: -200, y: -20, opacity: 0, duration: .53, ease: 'power4.in' }, close - .12);
  tl.to('#gallery', { scale: 1.9, y: 80, rotation: 8, opacity: 0, duration: .7, ease: 'power4.in' }, close - .07);
  tl.fromTo('#closing', { scale: .72, y: 110, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .75, ease: 'power4.out' }, close + .26);
  tl.fromTo('#closing > img', { rotation: -18, y: 80 }, { rotation: 0, y: 0, duration: .8, ease: 'back.out(1.2)' }, close + .26);
  tl.to('#closing', { scale: 1.035, y: -10, duration: 2.9, ease: 'none' }, close + .85);
  tl.to('#colour-field', { opacity: .85, duration: 2, ease: 'power1.inOut' }, 13);
  // Resolve every tween's starting pose before Beam can seek directly to any frame.
  tl.progress(1).progress(0);
  return tl;
}
