import { config } from '@vue/test-utils';
import { beforeEach } from 'vitest';
import { i18n, setCurrentLocale } from '../src/i18n';

config.global.plugins = [i18n];

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}

beforeEach(() => {
  setCurrentLocale('en');
});

// jsdom does not implement the scrolling API used by virtualized lists.
// Keep the behavior that the components rely on (updating the scroll offset)
// while avoiding unhandled errors when a list resets or navigates.
if (typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.scrollTo !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, xOrOptions: number | ScrollToOptions = 0, y = 0) {
      if (typeof xOrOptions === 'number') {
        this.scrollLeft = xOrOptions;
        this.scrollTop = y;
        return;
      }
      if (typeof xOrOptions.left === 'number') this.scrollLeft = xOrOptions.left;
      if (typeof xOrOptions.top === 'number') this.scrollTop = xOrOptions.top;
    },
  });
}
