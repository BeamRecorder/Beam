export function fileMotion(tl) {
  tl.set('.folder-grid,.folder-popup,.files-camera .cursor', { autoAlpha: 0 }, 0)
    .fromTo(
      '.files-browser',
      { scale: 0.8, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: 'power3.out' },
      39.433,
    )
    .set('.files-browser', { autoAlpha: 0 }, 40.367)
    .set('.folder-grid', { autoAlpha: 1 }, 40.367)
    .fromTo('.folder-grid', { y: 45 }, { y: 0, duration: 0.3, ease: 'power3.out' }, 40.367)
    .fromTo(
      '.files-camera .cursor',
      { x: 140, y: 90, autoAlpha: 0 },
      { x: -225, y: -80, autoAlpha: 1, duration: 0.5, ease: 'power2.out' },
      40.7,
    )
    .fromTo(
      '.folder-popup',
      { autoAlpha: 0, scale: 0.94, y: 12 },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.2, ease: 'power3.out' },
      41.2,
    )
    .fromTo(
      '.file-list-camera',
      { x: 90, scale: 1.12, opacity: 0 },
      { x: 0, scale: 1, opacity: 1, duration: 0.2, ease: 'power3.out' },
      42.167,
    )
    .fromTo('.connections-card', { x: 70, scale: 1.05 }, { x: 0, scale: 1, duration: 0.3, ease: 'power3.out' }, 42.733)
    .fromTo(
      '.connections-logos img',
      { clipPath: 'inset(0 45% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: 1, ease: 'power2.out' },
      42.75,
    )
    .fromTo('.connections-logos span', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 43.233)
    .fromTo('#ask-title .title', { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 }, 43.933)
    .fromTo('#question-prompt', { scale: 4.8, x: 1480 }, { scale: 4.8, x: 1480, duration: 0.3, ease: 'none' }, 46.4)
    .to('#question-prompt', { scale: 1, x: 0, duration: 0.5, ease: 'power3.inOut' }, 47.067)
    .fromTo(
      '#question-prompt .cursor',
      { x: 140, y: 150, autoAlpha: 0 },
      { x: 0, y: 0, autoAlpha: 1, duration: 0.3, ease: 'power3.out' },
      47.4,
    )
    .to('#question-prompt .cursor', { y: -60, duration: 0.2 }, 47.85)
    .to('#question-prompt .send', { scale: 0.85, duration: 0.067 }, 48.067)
    .to('#question-prompt .send', { scale: 1, duration: 0.12 }, 48.134)
    .set('.answer-camera,.answer-header', { autoAlpha: 0 }, 0)
    .fromTo('.answer-closeup', { y: 180 }, { y: 0, duration: 0.25, ease: 'power3.out' }, 48.267)
    .fromTo('.answer-closeup p', { opacity: 0 }, { opacity: 1, duration: 0.45 }, 48.4)
    .set('.answer-closeup', { autoAlpha: 0 }, 49.6)
    .set('.answer-camera', { autoAlpha: 1 }, 49.6)
    .fromTo('.answer-camera', { scale: 1.14 }, { scale: 1, duration: 0.4, ease: 'power3.out' }, 49.6)
    .set('.answer-camera', { autoAlpha: 0 }, 51.167)
    .set('.answer-header', { autoAlpha: 1 }, 51.167)
    .fromTo(
      '.answer-header',
      { scale: 0.88, x: 110, y: 35 },
      { scale: 1, x: 0, y: 0, duration: 0.3, ease: 'power3.out' },
      51.167,
    )
    .fromTo('.answer-header .cursor', { x: -80, y: 170 }, { x: 0, y: 0, duration: 0.45, ease: 'power3.inOut' }, 51.6)
    .fromTo('.source-panel', { x: 960 }, { x: 0, duration: 0.3, ease: 'power3.out' }, 52.6)
    .fromTo('.source-list', { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, 52.6)
    .fromTo('.source-line', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, stagger: 0.095 }, 52.6)
    .to('.source-list', { y: -230, duration: 2.25, ease: 'none' }, 52.75)
    .fromTo('.works-title', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, 55)
    .fromTo('.slack-phone', { scale: 1.1, y: 25 }, { scale: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 55)
    .set('.slack-closeup,.slack-reply,.reply-text,.reply-attachment,.reply-link', { autoAlpha: 0 }, 0)
    .set('.slack-reply', { autoAlpha: 1 }, 55.8)
    .set('.thinking', { autoAlpha: 0 }, 56.833)
    .fromTo('.reply-text,.reply-attachment,.reply-link', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.233 }, 57)
    .to('.phone-panel', { x: -960, duration: 0.4, ease: 'power3.inOut' }, 56.667)
    .to('.slack-phone', { x: -650, y: 70, scale: 1.12, opacity: 0, duration: 0.4, ease: 'power3.inOut' }, 56.667)
    .fromTo(
      '.slack-closeup',
      { autoAlpha: 1, scale: 1.08, y: -30 },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.3, ease: 'power3.out' },
      56.933,
    );
}
