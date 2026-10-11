import { expect } from 'vitest';
import type { Page } from 'puppeteer-core';

export const expectCameraPreviewFill = async (page: Page, width: number, height: number) => {
  const video = await page.$('video');
  if (!video) throw new Error('Native webcam preview missing');
  const viewport = page.viewport();
  const layout = await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, fit: getComputedStyle(element).objectFit };
  });
  expect(layout).toEqual({ width: viewport!.width, height: viewport!.height, fit: 'cover' });
  const png = await video.screenshot();
  const samples = await page.evaluate(
    async ({ url, width, height }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const scale = Math.max(canvas.width / width, canvas.height / height);
      const x = (canvas.width - width * scale) / 2;
      const y = (canvas.height - height * scale) / 2;
      const expected = (sx: number, sy: number) => {
        if (sx < 0.12) return [255, 0, 0];
        if (sx >= 0.88) return [0, 255, 0];
        if (sy < 0.12) return [255, 255, 0];
        if (sy >= 0.88) return [0, 0, 255];
        return [102, 102, 102];
      };
      return [
        [0.06, 0.5],
        [0.94, 0.5],
        [0.5, 0.06],
        [0.5, 0.94],
        [0.5, 0.5],
      ].map(([u, v]) => ({
        actual: [...ctx.getImageData(Math.floor(canvas.width * u), Math.floor(canvas.height * v), 1, 1).data].slice(
          0,
          3,
        ),
        expected: expected((canvas.width * u - x) / (width * scale), (canvas.height * v - y) / (height * scale)),
      }));
    },
    { url: 'data:image/png;base64,' + Buffer.from(png).toString('base64'), width, height },
  );
  // Include the former letterbox areas. Inverse mapping checks a single scale
  // and centered crop, while the underlying recording stream stays unchanged.
  for (const sample of samples) expect(sample.actual).toEqual(sample.expected);
  expect(
    await page.$eval('video', (video) => ({
      width: video.videoWidth,
      height: video.videoHeight,
      source: (video.srcObject as MediaStream).getVideoTracks()[0].getSettings(),
    })),
  ).toMatchObject({ width, height, source: { width, height } });
};
