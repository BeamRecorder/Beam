import type { Browser } from 'puppeteer-core';

/** A stalled codec/CDP session must not leave the job's browser alive forever. */
export async function closeExportBrowser(browser: Browser, deadlineMs = 5000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.close().catch(() => browser.process()?.kill('SIGKILL')),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          browser.process()?.kill('SIGKILL');
          resolve();
        }, deadlineMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
