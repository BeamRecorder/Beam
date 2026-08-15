import { config } from "@vue/test-utils";
import { beforeEach } from "vitest";
import { i18n, setCurrentLocale } from "../src/i18n";

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
  setCurrentLocale("en");
});
