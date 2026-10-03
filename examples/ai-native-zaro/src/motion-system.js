export function systemMotion(tl) {
  tl.set(
    '.orbit,#system-top-left,#system-top-right,#system-bottom-left,#system-bottom-right,#system-back',
    { autoAlpha: 0 },
    0,
  )
    .fromTo('#main-system', { scale: 0.5 }, { scale: 0.62, duration: 0.3, ease: 'power3.out' }, 58.6)
    .to('.not-just', { opacity: 0, duration: 0.3 }, 59.667)
    .fromTo(
      '#main-system .orbit',
      { autoAlpha: 0, scale: 0.8 },
      { autoAlpha: 1, scale: 1, duration: 0.6, stagger: 0.06, ease: 'power3.out' },
      59.667,
    )
    .to('#main-system', { scale: 0.62, duration: 0.6, ease: 'sine.inOut' }, 59.667)
    .to('#main-system', { scale: 0.4, opacity: 0.3, duration: 0.4, ease: 'power3.inOut' }, 60.833)
    .set(
      '#system-top-left,#system-top-right,#system-bottom-left,#system-bottom-right,#system-back',
      { autoAlpha: 1 },
      61.2,
    )
    .set(
      '#system-top-left .orbit,#system-top-right .orbit,#system-bottom-left .orbit,#system-bottom-right .orbit,#system-back .orbit',
      { autoAlpha: 1 },
      61.2,
    )
    .to(
      '#system-top-left,#system-top-right,#system-bottom-left,#system-bottom-right',
      { scale: 0.7, duration: 1.2, ease: 'power3.out' },
      61.2,
    )
    .fromTo('.system-camera', { scale: 1.4, y: 150 }, { scale: 0.7, y: 0, duration: 1.35, ease: 'power3.inOut' }, 61.2)
    .to('.system-iris', { backgroundColor: '#1d1113', duration: 0.45 }, 61.667)
    .set('#system', { backgroundColor: '#edeee4' }, 64.933)
    .fromTo(
      '.system-iris',
      { clipPath: 'circle(120% at 50% 50%)' },
      { clipPath: 'circle(0% at 50% 50%)', duration: 0.467, ease: 'power3.inOut' },
      64.933,
    )
    .to('.system-camera', { opacity: 0.5, duration: 0.4 }, 62.6)
    .set('.system-camera', { filter: 'blur(6px)' }, 63.167)
    .fromTo(
      '.grew-copy',
      { opacity: 0, scale: 0.96 },
      { opacity: 1, scale: 1, duration: 0.25, ease: 'power3.out' },
      62.75,
    )
    .set('.grew-copy .caret', { opacity: 0 }, 63.4)
    .to('.system-camera', { scale: 0.65, y: -50, duration: 1.9, ease: 'sine.inOut' }, 62.7)
    .fromTo(
      '#end-brand .brand-mark',
      { x: 240, scale: 0.02, rotation: -110 },
      { x: 240, scale: 1, rotation: 0, duration: 0.55, ease: 'back.out(1.3)' },
      65.4,
    )
    .set('#end-brand .brand-word', { autoAlpha: 0 }, 0)
    .to('#end-brand .brand-mark', { x: 0, duration: 0.3, ease: 'power3.inOut' }, 66)
    .fromTo(
      '#end-brand .brand-word',
      { autoAlpha: 0, x: -45 },
      { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power3.out' },
      66.05,
    )
    .fromTo(
      '.end-cta',
      { y: 20, opacity: 0, scale: 0.92 },
      { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' },
      66.3,
    )
    .fromTo('.end-map', { opacity: 0, scale: 1.1 }, { opacity: 0.8, scale: 1, duration: 1.3, ease: 'sine.out' }, 65.75);
  document.querySelectorAll('.orbit').forEach((orbit, index) => {
    tl.to(orbit, { rotation: index % 2 ? -22 : 18, duration: 5.25, ease: 'none' }, 59.667);
  });
}
