// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { closeExportBrowser } from './browser-lifecycle';
afterEach(() => vi.useRealTimers());
function browser(close: () => Promise<void>, owned = true) {
  const kill = vi.fn();
  return {
    host: {
      close,
      process: () => (owned ? { kill } : null),
    } as unknown as Browser,
    kill,
  };
}
it('closes a responsive owned browser without killing it', async () => {
  const { host, kill } = browser(async () => {});
  await closeExportBrowser(host);
  expect(kill).not.toHaveBeenCalled();
});
it('kills only the owned browser when CDP close rejects', async () => {
  const { host, kill } = browser(async () => {
    throw new Error('disconnected');
  });
  await closeExportBrowser(host);
  expect(kill).toHaveBeenCalledWith('SIGKILL');
  await closeExportBrowser(
    browser(async () => {
      throw new Error('disconnected');
    }, false).host,
  );
});
it('bounds a stalled close and handles an already absent process', async () => {
  vi.useFakeTimers();
  for (const owned of [true, false]) {
    const { host, kill } = browser(() => new Promise(() => {}), owned);
    const closed = closeExportBrowser(host, 20);
    await vi.advanceTimersByTimeAsync(20);
    await closed;
    expect(kill).toHaveBeenCalledTimes(owned ? 1 : 0);
  }
});
