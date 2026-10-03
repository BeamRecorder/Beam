export function agentMotion(tl) {
  tl.fromTo(
    '.agent-list-camera',
    { scale: 0.9, y: 35, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.38, ease: 'power3.out' },
    22.467,
  )
    .fromTo(
      '.agent-row',
      { x: 18, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.28, stagger: 0.055, ease: 'power2.out' },
      22.567,
    )
    .to('.agent-list-camera', { scale: 0.97, duration: 0.8, ease: 'sine.inOut' }, 23.2)
    .fromTo(
      '.result-camera',
      { scale: 0.85, x: 100, y: 50 },
      { scale: 1, x: 0, y: 0, duration: 0.24, ease: 'power3.out' },
      24.133,
    )
    .fromTo(
      '.pipeline-camera',
      { scale: 1.65, x: -600, y: -450 },
      { scale: 1.65, x: -600, y: -450, duration: 0.3, ease: 'power3.out' },
      25.133,
    )
    .fromTo(
      '.deal-drag',
      { x: 0, y: 0, opacity: 0 },
      { x: 150, y: 0, opacity: 1, duration: 0.22, ease: 'power2.out' },
      25.033,
    )
    .to('.deal-drag', { x: 210, y: 0, duration: 0.5, ease: 'power2.inOut' }, 25.3)
    .to('.deal-drag', { x: 226, y: 27, scale: 0.94, duration: 0.2, ease: 'power3.out' }, 25.8)
    .to('.deal-drag', { opacity: 0, duration: 0.15 }, 26.3)
    .fromTo('.chart-camera', { x: -35, scale: 1.06 }, { x: 0, scale: 1, duration: 0.7, ease: 'power2.out' }, 26.8)
    .fromTo('#simple .split-brown', { x: -960 }, { x: 0, duration: 0.28, ease: 'power3.out' }, 28.333)
    .fromTo(
      '.digest-prompt',
      { x: 160, scale: 0.9, opacity: 0 },
      { x: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'power3.out' },
      28.333,
    )
    .set('.slack-chip,.digest-too', { autoAlpha: 0 }, 0)
    .fromTo(
      '.slack-chip',
      { autoAlpha: 0, scale: 0.85 },
      { autoAlpha: 1, scale: 1, duration: 0.18, ease: 'power2.out' },
      28.95,
    )
    .set('.digest-too', { autoAlpha: 1 }, 29.433)
    .fromTo(
      '.digest-input .cursor',
      { x: 180, y: 160, autoAlpha: 0 },
      { x: 0, y: -130, autoAlpha: 1, duration: 0.35, ease: 'power2.out' },
      29.65,
    )
    .to('.digest-input .send', { scale: 0.85, duration: 0.07 }, 30.1)
    .to('.digest-input .send', { scale: 1, duration: 0.13 }, 30.17)
    .fromTo('#powerful .split-title', { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 }, 30.4)
    .fromTo(
      '.workflow-camera',
      { scale: 2.5, x: 330, y: 320 },
      { scale: 1, x: 0, y: 0, duration: 2.2, ease: 'power2.inOut' },
      30.4,
    )
    .fromTo(
      '.workflow-node',
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.3, stagger: 0.13, ease: 'power3.out' },
      30.45,
    )
    .to('.workflow-camera', { x: -960, scale: 0.75, duration: 0.4, ease: 'power3.in' }, 32.467);
}
