import { readFileSync } from 'node:fs';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE, SURFACE_TONES } from '~/types/appearance';
import { mountStartupShell } from './startup-shell';
import type { StartupShell } from './startup-types';

const portrait = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock('./startup-portrait', () => ({
  animateStartupPortrait: () => portrait,
}));
let element: HTMLElement;
let stylesheet: HTMLStyleElement;
const palette = readFileSync('apps/desktop/src/theme/surfaces.css', 'utf8');
let hidden: boolean;
const shells: StartupShell[] = [];
const flush = async () => {
  await vi.dynamicImportSettled();
  await flushPromises();
};
const setup = () => {
  const shell = mountStartupShell(element);
  shells.push(shell);
  return shell;
};
beforeEach(() => {
  stylesheet = document.createElement('style');
  stylesheet.textContent = palette;
  document.head.append(stylesheet);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear();
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  element = document.createElement('div');
  element.innerHTML = '<span data-startup-tip-label></span><span data-startup-tip></span>';
  portrait.dispose.mockClear();
  vi.stubGlobal('capture', undefined);
});
afterEach(() => {
  stylesheet.remove();
  shells.splice(0).forEach((shell) => shell.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

describe('startup shell tips and theme', () => {
  it('loads the selected language and rotates eight distinct tips while visible', async () => {
    localStorage.setItem('locale', 'fr');
    setup();
    await flush();
    expect(document.documentElement.lang).toBe('fr');
    expect(element.getAttribute('aria-label')).toBe('Chargement de Beam');
    expect(element.dataset.retryLabel).toBe('Recharger Beam');
    expect(element.querySelector('[data-startup-tip-label]')?.textContent).toBe('Astuce :');
    const tips = new Set<string | null>();
    for (let index = 0; index < 8; index++) {
      tips.add(element.querySelector('[data-startup-tip]')!.textContent);
      vi.advanceTimersByTime(4000);
    }
    expect(tips.size).toBe(8);
    expect(localStorage.getItem('beam.startup-tip')).toBe('1');
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    const displayed = element.textContent;
    vi.advanceTimersByTime(100000);
    expect(element.textContent).toBe(displayed);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(1);
  });
  it.each(['not-a-number', '-1', '1.5', '99'])('normalizes saved tip index %s', async (saved) => {
    localStorage.setItem('beam.startup-tip', saved);
    setup();
    await flush();
    expect(element.querySelector('[data-startup-tip]')!.textContent).toBeTruthy();
    expect(Number(localStorage.getItem('beam.startup-tip'))).toBe(saved === '99' ? 4 : 1);
  });
  it('keeps tips readable with blocked tip storage and a pending error button', async () => {
    const button = document.createElement('button');
    element.append(button);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    setup();
    await flush();
    expect(element.querySelector('[data-startup-tip]')!.textContent).toBeTruthy();
    expect(button.textContent).toBe('Reload Beam');
    expect(button.getAttribute('aria-label')).toBe('Reload Beam');
  });
  it.each(['fail', 'dispose'] as const)('stops rotating on %s and owns the portrait lifecycle', async (action) => {
    const shell = setup();
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    shell[action]();
    expect(vi.getTimerCount()).toBe(0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    expect(portrait.dispose).toHaveBeenCalledOnce();
  });
  it('ignores translations and preferences that arrive after disposal', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('capture', {
      getPreferences: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const shell = setup();
    shell.dispose();
    resolve({ theme: 'dark', appearance: DEFAULT_APPEARANCE });
    await flush();
    expect(element.getAttribute('aria-label')).toBeNull();
    expect(element.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
  it.each(['dark', 'light', 'system'] as const)('applies the saved %s theme before Vue mounts', async (theme) => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const appearance = {
      ...DEFAULT_APPEARANCE,
      primaryColor: '#993344',
      surfaceTone: 'slate' as const,
      radiusPx: 12,
    };
    vi.stubGlobal('capture', {
      getPreferences: async () => ({ theme, appearance }),
    });
    setup();
    await flush();
    const dark = theme !== 'light';
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(dark);
    expect(root.style.getPropertyValue('--color-primary')).toBe('#993344');
    expect(root.style.getPropertyValue('--radius-lg')).toBe('18px');
    expect(root.style.getPropertyValue('--color-bg-element')).toBe(
      SURFACE_TONES.slate[dark ? 'dark' : 'light'].bgElement,
    );
  });
  it.each(['light', 'dark'] as const)('resolves the default %s accent before Vue mounts', async (theme) => {
    vi.stubGlobal('capture', {
      getPreferences: async () => ({ theme, appearance: DEFAULT_APPEARANCE }),
    });
    setup();
    await flush();
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--color-bg-element')).toBe('');
    expect(getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()).toBe('#cf4a1d');
  });
  it('supports pill corners and preference snapshots without appearance', async () => {
    vi.stubGlobal('capture', {
      getPreferences: async () => ({
        theme: 'light',
        appearance: { ...DEFAULT_APPEARANCE, isPillRadius: true },
      }),
    });
    setup();
    await flush();
    expect(document.documentElement.style.getPropertyValue('--radius-lg')).toBe('9999px');
    vi.stubGlobal('capture', {
      getPreferences: async () => ({ theme: 'dark' }),
    });
    setup();
    await flush();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it('reports native preference failure while leaving translations and tips usable', async () => {
    const error = new Error('preferences unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('capture', {
      getPreferences: async () => {
        throw error;
      },
    });
    setup();
    await flush();
    expect(log).toHaveBeenCalledWith('Beam startup appearance failed:', error);
    expect(element.querySelector('[data-startup-tip]')!.textContent).toBeTruthy();
  });
  it('handles a hidden shell without tip markup and stops after disposal', async () => {
    element.innerHTML = '';
    hidden = true;
    const shell = setup();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(1);
    shell.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
