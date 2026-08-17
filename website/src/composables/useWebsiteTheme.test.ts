import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const THEME_QUERY = '(prefers-color-scheme: dark)';

const installMatchMedia = (initialMatches: boolean) => {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === 'function') listeners.add(listener as (event: MediaQueryListEvent) => void);
  });
  const removeEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === 'function') listeners.delete(listener as (event: MediaQueryListEvent) => void);
  });
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: THEME_QUERY,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn(() => mediaQuery);
  vi.stubGlobal('matchMedia', matchMedia);

  return {
    mediaQuery,
    emit(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: THEME_QUERY } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
};

describe('useWebsiteTheme', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.head.innerHTML = '<meta name="theme-color" content="#f7f5f0" />';
    delete document.documentElement.dataset.theme;
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.head.innerHTML = '';
    delete document.documentElement.dataset.theme;
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to the system preference and applies the light system theme', async () => {
    const media = installMatchMedia(false);
    const { useWebsiteTheme } = await import('./useWebsiteTheme');

    const theme = useWebsiteTheme();

    expect(theme.preference.value).toBe('system');
    expect(theme.resolvedTheme.value).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f7f5f0');
    expect(media.mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('restores a valid theme preference from localStorage', async () => {
    window.localStorage.setItem('beam-website-theme', 'dark');
    installMatchMedia(false);
    const { useWebsiteTheme } = await import('./useWebsiteTheme');

    const theme = useWebsiteTheme();

    expect(theme.preference.value).toBe('dark');
    expect(theme.resolvedTheme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#111110');
  });

  it('sets light, dark, and system preferences and persists each choice', async () => {
    installMatchMedia(true);
    const { useWebsiteTheme } = await import('./useWebsiteTheme');
    const theme = useWebsiteTheme();

    theme.setTheme('light');
    expect(theme.preference.value).toBe('light');
    expect(theme.resolvedTheme.value).toBe('light');
    expect(window.localStorage.getItem('beam-website-theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');

    theme.setTheme('dark');
    expect(theme.preference.value).toBe('dark');
    expect(theme.resolvedTheme.value).toBe('dark');
    expect(window.localStorage.getItem('beam-website-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    theme.setTheme('system');
    expect(theme.preference.value).toBe('system');
    expect(theme.resolvedTheme.value).toBe('dark');
    expect(window.localStorage.getItem('beam-website-theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('resolves system theme changes from matchMedia events', async () => {
    const media = installMatchMedia(false);
    const { useWebsiteTheme } = await import('./useWebsiteTheme');
    const theme = useWebsiteTheme();

    media.emit(true);
    expect(theme.preference.value).toBe('system');
    expect(theme.resolvedTheme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    media.emit(false);
    expect(theme.resolvedTheme.value).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('falls back to system for an invalid stored preference', async () => {
    window.localStorage.setItem('beam-website-theme', 'sepia');
    installMatchMedia(true);
    const { useWebsiteTheme } = await import('./useWebsiteTheme');

    const theme = useWebsiteTheme();

    expect(theme.preference.value).toBe('system');
    expect(theme.resolvedTheme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('shares the resolved class and preference between consumers', async () => {
    installMatchMedia(false);
    const { useWebsiteTheme } = await import('./useWebsiteTheme');
    const first = useWebsiteTheme();
    const second = useWebsiteTheme();

    first.setTheme('dark');

    expect(second.preference.value).toBe('dark');
    expect(second.resolvedTheme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
