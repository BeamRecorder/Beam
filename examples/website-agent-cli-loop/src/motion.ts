import { gsap } from 'gsap';
import type { ScenePose } from './scene-types';
export function createMotion(pose: ScenePose) {
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(pose, { clock: 0 }, { clock: 7, duration: 7, ease: 'none' }, 0);
  timeline.fromTo('.command-content', { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0.25);
  timeline.fromTo('.closing', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 4.6);
  timeline.to('.command-content', { opacity: 0, duration: 0.35, ease: 'power2.in' }, 6.4);
  timeline.to('.closing', { opacity: 0, y: 8, duration: 0.3, ease: 'sine.in' }, 6.45);
  timeline.seek(0);
  return timeline;
}
