export function contextMotion(tl) {
  tl.fromTo('.connection-camera', { scale: 1.8 }, { scale: 1, duration: 0.8, ease: 'power3.out' }, 32.867).fromTo(
    '.floating-logo,.floating-note,.floating-sticky,.file-chip',
    { opacity: 0, scale: 0.25 },
    { opacity: 1, scale: 1, duration: 0.6, stagger: 0.018, ease: 'power3.out' },
    32.867,
  );
  for (let index = 0; index < 12; index++) {
    const sign = index % 2 === 0 ? 1 : -1;
    tl.to(
      '#connection-' + index,
      {
        x: sign * (260 + index * 35),
        y: ((index % 3) - 1) * 240,
        rotation: sign * 5,
        duration: 3.4,
        ease: 'sine.inOut',
      },
      33.3,
    );
  }
  tl.to('.floating-note', { x: 1350, y: -700, duration: 2.5, ease: 'sine.inOut' }, 34)
    .to('.floating-sticky', { x: 270, y: -320, duration: 2.5, ease: 'sine.inOut' }, 34)
    .to('.chip-one', { x: 300, y: -250, duration: 2.5, ease: 'sine.inOut' }, 34)
    .to('.chip-two', { x: 800, y: 70, duration: 2.5, ease: 'sine.inOut' }, 34)
    .to('.chip-three', { x: -550, y: -1020, duration: 2.5, ease: 'sine.inOut' }, 34)
    .fromTo(
      '.chaos-points',
      { scale: 1.1, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' },
      37.233,
    )
    .to('.chaos-points', { scale: 1.01, duration: 1.1, ease: 'sine.inOut' }, 37.3)
    .to('.chaos-points', { scale: 1.4, opacity: 0, duration: 0.33, ease: 'power3.in' }, 38.667)
    .fromTo(
      '.context-preview',
      { scale: 0.8, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.35, ease: 'power3.out' },
      38.667,
    );
}
