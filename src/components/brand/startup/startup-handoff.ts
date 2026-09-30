/** Move the already visible portrait into its measured HUD slot without
 * delaying renderer readiness or changing the native window's bounds. */
export function dockStartupMascot(startup: HTMLElement, dispose: () => void): void {
  const source = startup.querySelector<HTMLElement>('[data-startup-mascot]');
  const target = document.querySelector<HTMLElement>('[data-beamy-dock]');
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    dispose();
    startup.remove();
    document.documentElement.removeAttribute('data-beam-startup');
  };
  if (!source || !target || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    remove();
    return;
  }
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !from.height || !to.width || !to.height) {
    remove();
    return;
  }
  const x = to.x + to.width / 2 - from.x - from.width / 2;
  const y = to.y + to.height / 2 - from.y - from.height / 2;
  startup.dataset.docking = '';
  const animation = source.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${x}px, ${y}px) scale(${to.width / from.width})` },
    ],
    { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  );
  const cleanup = () => {
    window.removeEventListener('resize', cancel);
    window.removeEventListener('pagehide', cancel);
    remove();
  };
  const cancel = () => {
    animation.cancel();
    cleanup();
  };
  window.addEventListener('resize', cancel, { once: true });
  window.addEventListener('pagehide', cancel, { once: true });
  void animation.finished.catch(() => {}).finally(cleanup);
}
