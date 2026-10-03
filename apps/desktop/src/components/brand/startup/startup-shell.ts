import { detectLocale } from '~/i18n/locale-detection';
import type { CoreMessages } from '~/i18n/locale-message-types';
import { SURFACE_TONES } from '~/types/appearance';
import { resolveAppearanceAccent } from '~/theme/appearance-accent';
import type { StartupShell } from './startup-types';
import { animateStartupPortrait } from './startup-portrait';

const languages = import.meta.glob<CoreMessages>('../../../i18n/*/core.json', {
  import: 'default',
});
const TIP_KEYS = [
  'tipRegion',
  'tipPresets',
  'tipTeleprompter',
  'tipCountdown',
  'tipDevices',
  'tipInstant',
  'tipShortcuts',
  'tipProjects',
] as const;
const TIP_STORAGE = 'beam.startup-tip';

export function mountStartupShell(element: HTMLElement): StartupShell {
  const portrait = animateStartupPortrait(element);
  let disposed = false;
  let failed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tips: string[] = [];
  let index = 0;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const showTip = () => {
    const tip = element.querySelector('[data-startup-tip]');
    if (tip) tip.textContent = tips[index % tips.length]!;
  };
  const synchronize = () => {
    stop();
    if (disposed || failed || document.hidden || !tips.length) return;
    timer = setInterval(() => {
      index += 1;
      showTip();
    }, 4000);
  };
  document.addEventListener('visibilitychange', synchronize);
  const locale = detectLocale();
  document.documentElement.lang = locale;
  void languages[`../../../i18n/${locale}/core.json`]!()
    .then(({ Brand: messages }) => {
      if (disposed) return;
      element.setAttribute('aria-label', messages.loading);
      element.dataset.retryLabel = messages.reload;
      const retry = element.querySelector('button');
      if (retry) {
        retry.textContent = messages.reload;
        retry.setAttribute('aria-label', messages.reload);
      }
      const label = element.querySelector('[data-startup-tip-label]');
      if (label) label.textContent = `${messages.tipLabel} :`;
      tips = TIP_KEYS.map((key) => messages[key]);
      try {
        const saved = Number(localStorage.getItem(TIP_STORAGE));
        index = Number.isInteger(saved) && saved >= 0 ? saved % tips.length : 0;
        localStorage.setItem(TIP_STORAGE, String((index + 1) % tips.length));
      } catch {}
      showTip();
      synchronize();
    })
    .catch((reason: unknown) => console.error('Beam startup translations failed:', reason));

  void window.capture
    ?.getPreferences()
    .then((preferences) => {
      if (disposed) return;
      const appearance = preferences.appearance;
      const dark =
        preferences.theme === 'dark' ||
        (preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      const root = document.documentElement;
      root.classList.toggle('dark', dark);
      if (!appearance) return;
      const tone = SURFACE_TONES[appearance.surfaceTone] ?? SURFACE_TONES.default;
      const surfaces = tone === SURFACE_TONES.default ? null : dark ? tone.dark : tone.light;
      const accent = resolveAppearanceAccent(appearance, dark);
      if (accent) root.style.setProperty('--color-primary', accent.primary);
      else root.style.removeProperty('--color-primary');
      root.style.setProperty(
        '--radius-lg',
        appearance.isPillRadius ? '9999px' : `${Math.round(appearance.radiusPx * 1.5)}px`,
      );
      if (surfaces) {
        root.style.setProperty('--color-bg-element', surfaces.bgElement);
        root.style.setProperty('--color-border', surfaces.border);
      } else {
        root.style.removeProperty('--color-bg-element');
        root.style.removeProperty('--color-border');
      }
    })
    .catch((reason: unknown) => console.error('Beam startup appearance failed:', reason));

  return {
    fail: () => {
      failed = true;
      stop();
      portrait.dispose();
    },
    dispose: () => {
      disposed = true;
      stop();
      portrait.dispose();
      document.removeEventListener('visibilitychange', synchronize);
    },
  };
}
