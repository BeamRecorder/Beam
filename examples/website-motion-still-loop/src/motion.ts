import { gsap } from 'gsap';
import type { ScenePose } from './scene-types';

// This exact timeline powers the standalone HTML/PNG and the moving preview.
export function createMotion(pose: ScenePose, presentation: boolean) {
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(pose, { clock: 0 }, { clock: 7, duration: 7, ease: 'none' }, 0);
  timeline.fromTo(
    '.orbit',
    { rotation: 0, force3D: false },
    { rotation: (360 * 2.4) / 7, duration: 2.4, ease: 'none' },
    0,
  );
  timeline.to('.orbit', { rotation: 360, duration: 4.1, ease: 'none' }, 2.9);
  if (presentation) {
    // Adapted split-tilt-cards arrivals, with flat 2D transforms only.
    timeline.fromTo(
      '.motion-output',
      { opacity: 0, x: -18 },
      { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' },
      0.2,
    );
    timeline.fromTo(
      '.still-output',
      { opacity: 0, x: 18 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' },
      0.28,
    );
    timeline.fromTo('.caption', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'sine.out' }, 0.55);
    const border = getComputedStyle(document.documentElement).getPropertyValue('--color-border-strong').trim();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    timeline.fromTo(
      '.still-output',
      { borderColor: border },
      { borderColor: accent, duration: 0.2, ease: 'power1.out' },
      2.4,
    );
    timeline.to('.still-output', { borderColor: border, duration: 0.35, ease: 'sine.inOut' }, 2.9);
    timeline.to('.motion-output', { opacity: 0, x: -18, duration: 0.3, ease: 'power1.in' }, 6.7);
    timeline.to('.still-output', { opacity: 0, x: 18, duration: 0.25, ease: 'power2.in' }, 6.75);
    timeline.to('.caption', { opacity: 0, duration: 0.25, ease: 'sine.in' }, 6.75);
  }
  timeline.seek(0);
  return timeline;
}
