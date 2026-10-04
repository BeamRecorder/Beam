import { gsap } from 'gsap';
import { DURATION } from './scene-state';
import type { ScenePose } from './scene-types';

export function createMotion(pose: ScenePose) {
  // A paused timeline at exactly zero has not rendered its zero-time sets yet.
  // Seed the opening actors so first and reverse-zero frames use the same layers.
  gsap.set('.orbit', { rotation: 0, force3D: true });
  gsap.set('.save-button', { scale: 1, force3D: true });
  const tl = gsap.timeline({ paused: true });
  tl.set('.orbit', { rotation: 0, force3D: true }, 0);
  tl.set('.save-button', { scale: 1, force3D: true }, 0);
  tl.addLabel('edit-html', 1.4);
  tl.addLabel('save-source', 3.15);
  tl.addLabel('animate-canvas', 4.8);
  tl.addLabel('finished-frame', 8.6);
  tl.fromTo(pose, { clock: 0 }, { clock: DURATION, duration: DURATION, ease: 'none' }, 0);
  tl.fromTo(
    '.orbit',
    { rotation: 0 },
    { rotation: 180, duration: 2, ease: 'power2.inOut', immediateRender: false },
    5.1,
  );
  tl.to('.orbit', { rotation: 0, duration: 1.05, ease: 'power2.inOut' }, 10.75);
  tl.fromTo(
    '.save-button',
    { scale: 1 },
    { scale: 0.94, duration: 0.12, ease: 'power2.out', immediateRender: false },
    3.02,
  );
  tl.to('.save-button', { scale: 1, duration: 0.22, ease: 'back.out(1.8)' }, 3.14);
  return tl;
}
