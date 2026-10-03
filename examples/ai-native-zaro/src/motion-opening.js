export function openingMotion(tl) {
  tl.fromTo('.intro-simple', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power3.out' }, 0.067)
    .set('.intro-simple', { autoAlpha: 0 }, 0.633)
    .fromTo(
      '.intro-line',
      { opacity: 0, scale: 0.84 },
      { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' },
      0.633,
    )
    .fromTo(
      '.app-cycle',
      { scale: 0, x: -50, opacity: 0 },
      { scale: 1, x: 0, opacity: 1, duration: 0.23, ease: 'power3.out' },
      0.633,
    )
    .fromTo(
      '.agent-cycle',
      { scale: 0, x: 80, opacity: 0 },
      { scale: 1, x: 0, opacity: 1, duration: 0.23, ease: 'power3.out' },
      0.633,
    )
    .set('.small-app, .agent-label', { autoAlpha: 0 }, 0)
    .set('.small-app.purple, .agent-label.aqua', { autoAlpha: 1 }, 0.633)
    .set('.small-app.purple, .agent-label.aqua', { autoAlpha: 0 }, 0.933)
    .set('.small-app.yellow, .agent-label.yellow', { autoAlpha: 1 }, 0.933)
    .set('.small-app.yellow, .agent-label.yellow', { autoAlpha: 0 }, 1.467)
    .set('.small-app.orange, .agent-label.orange', { autoAlpha: 1 }, 1.467)
    .set('.small-app.orange, .agent-label.orange', { autoAlpha: 0 }, 1.867)
    .set('.small-app.yellow, .agent-label.deal', { autoAlpha: 1 }, 1.867)
    .to('.intro-line', { scale: 1.18, opacity: 0, duration: 0.18, ease: 'power3.in' }, 2.2)
    .fromTo('#one-prompt .one-line', { scale: 0.85 }, { scale: 1, duration: 0.4, ease: 'power3.out' }, 2.367)
    .fromTo('#one-prompt .world-map', { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.5 }, 2.5)
    .to('#one-prompt .one-line', { scale: 1.025, duration: 1.6, ease: 'none' }, 3.2)
    .set('#one-prompt .caret', { opacity: 0 }, 2.8)
    .fromTo('.purple-wash', { scale: 1.8, x: 400, opacity: 1 }, { scale: 1, x: 0, opacity: 1, duration: 0.25 }, 5)
    .fromTo('.meet-copy', { scale: 1.3, opacity: 1 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' }, 5)
    .to('.meet-copy', { scale: 2.8, opacity: 0, duration: 0.22, ease: 'power3.in' }, 5.5)
    .fromTo('.brand-wipe', { scale: 1 }, { scale: 1.8, duration: 0.4, ease: 'power3.in' }, 5.733)
    .set('.brand-wipe', { autoAlpha: 0 }, 6.2)
    .set('#opening-brand .brand-word', { autoAlpha: 0 }, 0)
    .fromTo(
      '#opening-brand .brand-mark',
      { x: 240, scale: 0.02, rotation: -100 },
      { x: 240, scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(1.4)' },
      5.733,
    )
    .to('#opening-brand .brand-mark', { x: 0, duration: 0.35, ease: 'power3.inOut' }, 6.433)
    .fromTo(
      '#opening-brand .brand-word',
      { autoAlpha: 0, x: -50, scale: 0.9 },
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.35, ease: 'power3.out' },
      6.533,
    )
    .to('#opening-brand', { scale: 0.12, rotation: 120, opacity: 0, duration: 0.5, ease: 'power3.inOut' }, 8.133)
    .fromTo('#build-title .title', { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 }, 8.533)
    .fromTo(
      '#app-prompt',
      { scale: 0.84, y: 18, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.28, ease: 'power3.out' },
      11,
    )
    .fromTo(
      '#app-prompt .cursor',
      { x: 200, y: 160, autoAlpha: 0 },
      { x: 0, y: 0, autoAlpha: 1, duration: 0.35, ease: 'power2.out' },
      11.65,
    )
    .to('#app-prompt .cursor', { y: -65, scale: 0.8, duration: 0.22 }, 12.15)
    .to('#app-prompt .send', { scale: 0.86, duration: 0.07 }, 12.467)
    .to('#app-prompt .send', { scale: 1, duration: 0.12 }, 12.537)
    .fromTo(
      '.dashboard-camera',
      { scale: 1, opacity: 1 },
      { scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' },
      13,
    )
    .to('.app-blank', { scaleX: 0, duration: 0.67, ease: 'power3.inOut' }, 13.1)
    .to('.app-loading', { autoAlpha: 0, duration: 0.3 }, 14.467)
    .fromTo(
      '.chat-camera',
      { scale: 0.85, x: 120, y: 80 },
      { scale: 1, x: 0, y: 0, duration: 0.24, ease: 'power3.out' },
      15.867,
    )
    .set('.agent-chip,.chat-message,.planning,.ask-empty', { autoAlpha: 0 }, 0)
    .fromTo(
      '.agent-chip',
      { autoAlpha: 0, scale: 0.8 },
      { autoAlpha: 1, scale: 1, duration: 0.22, ease: 'back.out(1.4)' },
      16.967,
    )
    .fromTo(
      '.chat-input .cursor',
      { autoAlpha: 0, x: 150, y: 150 },
      { autoAlpha: 1, x: 0, y: -125, duration: 0.5, ease: 'power2.out' },
      17.1,
    )
    .set('#agent-chat .typed,.agent-chip', { autoAlpha: 0 }, 17.8)
    .set('.ask-empty,.chat-message,.planning', { autoAlpha: 1 }, 17.8)
    .to('.chat-header', { y: -245, duration: 0.26 }, 17.8)
    .fromTo('#agents-title .title', { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2 }, 19.933)
    .fromTo(
      '.dot-agent',
      { scale: 0.1, opacity: 0, rotation: 12 },
      { scale: 1, opacity: 1, rotation: 0, duration: 0.5, stagger: 0.055, ease: 'back.out(1.2)' },
      19.933,
    )
    .to('#dotted-0', { x: -38, y: 10, duration: 2, ease: 'sine.inOut' }, 20.267)
    .to('#dotted-1', { x: 20, y: -27, duration: 2, ease: 'sine.inOut' }, 20.267)
    .to('#dotted-2', { x: 14, y: -45, duration: 2, ease: 'sine.inOut' }, 20.267)
    .to('#dotted-3', { x: -16, y: 24, duration: 2, ease: 'sine.inOut' }, 20.267);
}
