import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromiumExecutable } from '../../apps/cli/src/chromium-install';
import { chromiumSettings } from '../../apps/cli/src/chromium-settings';
import type { BrowserCaptureCase } from './capture-types';

// Real browser pixels, generated locally without external network or private app data.
const directory = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), 'beam-scrollweave-fixtures-'));
await mkdir(directory, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await chromiumExecutable(),
  headless: true,
  pipe: true,
  args: chromiumSettings().args,
});
const scenarios = [
  { name: 'plain-document', top: 0, bottom: 0, left: 0, right: 0, repeated: false },
  { name: 'fixed-header-sidebar', top: 48, bottom: 32, left: 80, right: 0, repeated: false },
  { name: 'nested-app-pane', top: 64, bottom: 44, left: 160, right: 96, repeated: false },
  { name: 'repeated-rows', top: 0, bottom: 0, left: 0, right: 0, repeated: true },
];
const manifest = { cases: [] as BrowserCaptureCase[] };
try {
  for (const scenario of scenarios) {
    const width = 640,
      height = 400;
    const contentWidth = width - scenario.left - scenario.right;
    const viewHeight = height - scenario.top - scenario.bottom;
    const positions = scenario.repeated
      ? [0, 240, 480]
      : [0, Math.floor(viewHeight * 0.55), Math.floor(viewHeight * 1.1)];
    const contentHeight = viewHeight + positions.at(-1)!;
    const rows = Array.from({ length: Math.ceil(contentHeight / 80) }, (_, index) => {
      const value = scenario.repeated ? 0 : index;
      return `<article style="height:80px;box-sizing:border-box;border-bottom:1px solid #cbd5e1;padding:9px 15px;display:flex;gap:12px;background:hsl(${(value * 47) % 360} 45% 95%)">
        <div style="width:${30 + ((value * 13) % 60)}px;flex-shrink:0;background:hsl(${(value * 73) % 360} 65% 35%);border-radius:${value % 9}px"></div>
        <div><strong>Record ${value * 137 + 29} — ${['Orion', 'Cloud', 'Beam', 'Forest'][value % 4]}</strong>
        <p style="margin:7px 0">${'Content capture '.repeat(1 + (value % 3))}${value * 919 + 61}</p></div>
      </article>`;
    }).join('');
    const content = `<main style="width:${contentWidth}px;height:${contentHeight}px;overflow:hidden;background:#fff">${rows}</main>`;
    const base =
      '<style>html,body{margin:0;font:14px Arial,sans-serif}*{box-sizing:border-box}::-webkit-scrollbar{display:none}</style>';
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(`${base}<div style="position:fixed;inset:0;background:#1e293b;color:#fff;padding:10px">Beam test application — fixed UI</div>
        <header style="position:fixed;top:0;left:${scenario.left}px;right:0;height:${scenario.top}px;background:#e2e8f0;color:#0f172a;padding:8px">Fixed application toolbar</header>
        <section id="pane" style="position:fixed;left:${scenario.left}px;top:${scenario.top}px;width:${contentWidth}px;height:${viewHeight}px;overflow:auto">${content}</section>`);
      const frames: string[] = [];
      const observed: number[] = [];
      for (const [index, position] of positions.entries()) {
        observed.push(
          await page.evaluate(async (position) => {
            const pane = document.querySelector<HTMLElement>('#pane')!;
            pane.scrollTop = position;
            await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
            return pane.scrollTop;
          }, position),
        );
        const path = `${scenario.name}-${index}.png`;
        await page.screenshot({ path: join(directory, path) });
        frames.push(path);
      }
      // Independent full-content truth: same markup/width, no fixed chrome or clipped ancestor.
      await page.setViewport({ width: contentWidth, height: 400, deviceScaleFactor: 1 });
      await page.setContent(`${base}${content}`);
      const truth = `${scenario.name}-truth.png`;
      await page.screenshot({ path: join(directory, truth), fullPage: true });
      manifest.cases.push({
        name: scenario.name,
        frames,
        positions: observed,
        truth,
        content: [scenario.left, scenario.top, scenario.left + contentWidth, scenario.top + viewHeight],
      });
    } finally {
      await page.close();
    }
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(join(directory, 'manifest.json'));
} finally {
  await browser.close();
}
