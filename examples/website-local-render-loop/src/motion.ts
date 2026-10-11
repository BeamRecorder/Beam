import { gsap } from 'gsap';
import type { ScenePose } from './scene-types';
export function createMotion(pose: ScenePose) {
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(pose, { clock: 0 }, { clock: 8, duration: 8, ease: 'none' }, 0);
  timeline.fromTo('.command-content', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.25);
  timeline.fromTo('.pipeline', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 1.9);
  timeline.fromTo('.render-status', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.1);
  timeline.fromTo('.saved-file', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 6);
  timeline.fromTo('.closing', { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 6.1);
  timeline.to('.command-content, .pipeline, .render-status, .closing', { opacity: 0, duration: 0.4 }, 7.35);
  timeline.set('.pipeline', { y: 14 }, 7.8);
  timeline.set('.saved-file', { opacity: 0, y: 8 }, 7.8);
  timeline.set('.closing', { y: 6 }, 7.8);
  timeline.seek(0);
  return timeline;
}
