import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".beam/website");
const base = process.argv[2] || "http://localhost:7000";
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
const reports = [];
let page;
try {
  for (const theme of ["light", "dark"]) {
    if (page) await page.close();
    page = await browser.newPage();
    page.on("pageerror", (error) =>
      console.error("Website runtime:", error.message),
    );
    await page.setViewport({ width: 1360, height: 900 });
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ]);
    await page.goto(`${base}/features/editing`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".feature-page > .feature-media video");
    await page.evaluate(() =>
      document
        .querySelector(".feature-page > .feature-media")
        .scrollIntoView({ block: "center" }),
    );
    await page.waitForFunction(
      (theme) => {
        const video = document.querySelector(
          ".feature-page > .feature-media video",
        );
        return (
          video?.readyState >= 2 &&
          !video.paused &&
          video.currentTime > 0 &&
          video.currentSrc.endsWith(`/editing-studio-${theme}.webm`)
        );
      },
      { timeout: 30000 },
      theme,
    );
    const state = await page.evaluate(() => {
      const section = document.querySelector(".feature-page > .feature-media"),
        video = section.querySelector("video");
      return {
        title: document.querySelector("h1").textContent,
        source: video.currentSrc,
        poster: video.poster,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        muted: video.muted,
        loop: video.loop,
        missing: Boolean(section.querySelector(".missing-media")),
      };
    });
    if (
      state.duration !== 15 ||
      state.width !== 1280 ||
      state.height !== 800 ||
      !state.loop ||
      !state.muted ||
      state.missing ||
      !state.poster.endsWith(`editing-studio-${theme}.webp`)
    ) {
      throw new Error(`Incorrect ${theme} media: ${JSON.stringify(state)}`);
    }
    await page.click(
      '.feature-page > .feature-media button[aria-label="Pause animation"]',
    );
    await page.waitForFunction(
      () =>
        document.querySelector(".feature-page > .feature-media video").paused,
    );
    const section = await page.$(".feature-page > .feature-media");
    await section.screenshot({ path: resolve(output, `${theme}.png`) });
    await page.click(
      '.feature-page > .feature-media button[aria-label="Play animation"]',
    );
    await page.waitForFunction(
      () =>
        !document.querySelector(".feature-page > .feature-media video").paused,
    );
    await page.evaluate(() =>
      document.querySelector("#export").scrollIntoView({ block: "center" }),
    );
    await page.waitForFunction(
      () =>
        document.querySelector(".feature-page > .feature-media video").paused,
    );
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.evaluate(() =>
      document
        .querySelector(".feature-page > .feature-media")
        .scrollIntoView({ block: "center" }),
    );
    await page.waitForFunction(() => {
      const rect = document
        .querySelector(".feature-page > .feature-media video")
        .getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0;
    });
    const reduced = await page.evaluate(
      () =>
        document.querySelector(".feature-page > .feature-media video").paused,
    );
    if (!reduced) throw new Error("Reduced motion autoplayed");
    reports.push({
      theme,
      ...state,
      pause: true,
      resume: true,
      offscreenPause: true,
      reducedMotion: true,
    });
  }
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(reports, null, 2),
  );
  console.log(
    "Website: both themes, metadata, autoplay, pause/resume, offscreen pause and reduced motion passed.",
  );
} catch (error) {
  if (page) {
    console.error(
      await page.evaluate(() =>
        [...document.querySelectorAll("video")].slice(0, 2).map((v) => ({
          source: v.currentSrc,
          ready: v.readyState,
          paused: v.paused,
          time: v.currentTime,
          error: v.error?.message,
          rect: v.getBoundingClientRect().toJSON(),
          hidden: document.hidden,
          reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        })),
      ),
    );
    await page.screenshot({ path: resolve(output, "failed.png") });
  }
  throw error;
} finally {
  await browser.close();
}
