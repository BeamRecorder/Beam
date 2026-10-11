import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";
const output = resolve(root, ".beam/website-proof");
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-gpu", "--disable-accelerated-video-decode"],
});
const results = [],
  errors = [];
const url = `${process.env.BEAM_WEBSITE_URL || "http://localhost:7000"}/features/instant`;
try {
  for (const [id, mode] of [
    ["hero", "hero"],
    ["presets", "presets"],
    ["local-export", "export"],
    ["clipboard", "clipboard"],
  ])
    for (const theme of ["light", "dark"]) {
      const selector = id === "hero" ? ".feature-page > .feature-media" : `#${id}`;
      console.log(`Checking ${mode}/${theme}`);
      const page = await browser.newPage();
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.setViewport({ width: 1440, height: 1000 });
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: theme },
        { name: "prefers-reduced-motion", value: "no-preference" },
      ]);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(`${selector} .playback-control button`);
      await page.waitForFunction(
        (selector) =>
          document.querySelector(`${selector} video`)?.__vueParentComponent
            ?.isMounted,
        {},
        selector,
      );
      await page.$eval(selector, (element) =>
        element.scrollIntoView({ behavior: "instant", block: "center" }),
      );
      await page.waitForFunction(
        ({ selector, mode, theme }) => {
          const v = document.querySelector(`${selector} video`);
          return (
            v?.currentSrc.endsWith(`instant-${mode}-${theme}.webm`) &&
            v.readyState >= 2 &&
            !v.paused
          );
        },
        { timeout: 20000 },
        { selector, mode, theme },
      ).catch(async error => {
        console.log(await page.evaluate(selector => {
          const v = document.querySelector(selector + ' video');
          return { source: v?.currentSrc, requested: v?.getAttribute('src'), ready: v?.readyState, paused: v?.paused, error: v?.error?.message, rect: v?.getBoundingClientRect().toJSON(), scrollY, videos: document.querySelectorAll('video').length };
        }, selector));
        await page.screenshot({ path: resolve(output, 'failure.png') });
        throw error;
      });
      await page.click(`${selector} .playback-control button`);
      await page.waitForFunction(
        (selector) => document.querySelector(`${selector} video`).paused,
        {},
        selector,
      );
      await page.evaluate(
        async ({ selector, mode }) => {
          const v = document.querySelector(`${selector} video`);
          const sought = new Promise((resolve) =>
            v.addEventListener("seeked", resolve, { once: true }),
          );
          v.currentTime = mode === "hero" ? 11.95 : mode === "presets" ? 2.45 : 6.3;
          await sought;
        },
        { selector, mode },
      );
      await (
        await page.$(selector)
      ).screenshot({ path: resolve(output, `${mode}-${theme}-desktop.png`) });
      const metadata = await page.$eval(`${selector} video`, (v) => ({
        source: v.currentSrc,
        poster: v.poster,
        paused: v.paused,
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      }));
      if (
        metadata.duration !== (mode === "hero" ? 24 : 8) ||
        metadata.width !== 1280 ||
        metadata.height !== 800
      )
        throw new Error("Unexpected website video metadata");
      await page.setViewport({ width: 390, height: 844 });
      await page.$eval(selector, (element) =>
        element.scrollIntoView({ behavior: "instant", block: "center" }),
      );
      const fits = await page.$eval(selector, (section) => {
        const box = section.querySelector("video").getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth;
      });
      if (!fits) throw new Error("Mobile video overflow");
      if (!(await page.$eval(`${selector} video`, (v) => v.paused)))
        throw new Error("Manual pause did not survive resize");
      await (
        await page.$(selector)
      ).screenshot({ path: resolve(output, `${mode}-${theme}-mobile.png`) });
      results.push({
        mode,
        theme,
        ...metadata,
        mobileFits: true,
        manualPause: true,
      });
      await page.close();
    }
  const reduced = await browser.newPage();
  await reduced.setViewport({ width: 1280, height: 900 });
  await reduced.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await reduced.goto(url, { waitUntil: "domcontentloaded" });
  for (const id of ["hero", "presets", "local-export", "clipboard"]) {
    const selector = id === "hero" ? ".feature-page > .feature-media" : `#${id}`;
    await reduced.waitForSelector(`${selector} .playback-control button`);
    await reduced.waitForFunction(
      (selector) =>
        document.querySelector(`${selector} video`)?.__vueParentComponent?.isMounted,
      {},
      selector,
    );
    await reduced.$eval(selector, (element) =>
      element.scrollIntoView({ behavior: "instant", block: "center" }),
    );
    await reduced.waitForFunction(
      (selector) =>
        !!document.querySelector(
          `${selector} .playback-control button[aria-label="Play animation"]`,
        ),
      {},
      selector,
    );
    if (!(await reduced.$eval(`${selector} video`, (v) => v.paused)))
      throw new Error("Reduced motion started the animation");
  }
  await reduced.close();
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(
      { samples: results, reducedMotionPaused: true, runtimeErrors: 0 },
      null,
      2,
    ),
  );
  console.log(
    "Instant website: continuous hero, both themes, playback, pause, mobile fit and reduced motion passed.",
  );
} finally {
  await browser.close();
}
