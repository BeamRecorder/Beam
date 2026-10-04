import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";

const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
const output = resolve(root, ".beam/website-verification");
mkdirSync(output, { recursive: true });
const report = [];
try {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ]);
    await page.goto(
      `${process.env.BEAM_WEBSITE_URL || "http://127.0.0.1:7000"}/features/editing`,
      { waitUntil: "networkidle0" },
    );
    await page.waitForSelector("#canvas video");
    await page.$eval("#canvas", (element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await page
      .waitForFunction(
        () => {
          const video = document.querySelector("#canvas video");
          return (
            video &&
            !video.paused &&
            video.readyState >= 2 &&
            video.currentTime > 0.1
          );
        },
        { timeout: 15000 },
      )
      .catch(async (error) => {
        console.log(
          await page.evaluate(() => {
            const video = document.querySelector("#canvas video");
            const rect = video?.getBoundingClientRect();
            return {
              scrollY,
              height: innerHeight,
              rect: rect && { top: rect.top, height: rect.height },
              src: video?.currentSrc,
              paused: video?.paused,
              readyState: video?.readyState,
              mediaError: video?.error?.message,
              text: document.querySelector("#canvas")?.textContent,
            };
          }),
        );
        await page.screenshot({ path: resolve(output, `${theme}-failed.png`) });
        throw error;
      });
    const before = await page.$eval(
      "#canvas video",
      (video) => video.currentTime,
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    const playback = await page.$eval("#canvas video", (video) => ({
      currentTime: video.currentTime,
      src: video.currentSrc,
      poster: video.poster,
      muted: video.muted,
      loop: video.loop,
      duration: video.duration,
      frames: video.getVideoPlaybackQuality().totalVideoFrames,
      droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
    }));
    if (
      !playback.src.endsWith(`editing-canvas-${theme}.webm`) ||
      playback.currentTime <= before ||
      Math.abs(playback.duration - 7) > 0.05 ||
      !playback.muted ||
      !playback.loop
    )
      throw new Error(
        `${theme} video did not play the expected seven-second muted loop.`,
      );
    const layout = await page.$eval("#canvas .feature-media", (figure) => {
      const frame = figure.getBoundingClientRect();
      const video = figure.querySelector("video").getBoundingClientRect();
      const button = figure.querySelector("button").getBoundingClientRect();
      return {
        insetX: video.left - frame.left,
        insetY: video.top - frame.top,
        widthGap: frame.width - video.width,
        heightGap: frame.height - video.height,
        controlRight: frame.right - button.right,
        controlBottom: frame.bottom - button.bottom,
      };
    });
    if (
      Object.values(layout).some((value) => value < 0) ||
      layout.heightGap > 3 ||
      layout.widthGap > 3 ||
      layout.controlRight > 16 ||
      layout.controlBottom > 16
    )
      throw new Error(
        `${theme} video or playback overlay does not fill its media panel: ${JSON.stringify(layout)}`,
      );
    await page.click('#canvas [aria-label="Pause animation"]');
    const stopped = await page.$eval(
      "#canvas video",
      (video) => video.currentTime,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (
      Math.abs(
        (await page.$eval("#canvas video", (video) => video.currentTime)) -
          stopped,
      ) > 0.03
    )
      throw new Error(`${theme} pause did not stop the video.`);
    await page.screenshot({ path: resolve(output, `${theme}-page.png`) });
    report.push({ theme, ...playback, manualPause: true });
    await page.emulateMediaFeatures([
      {
        name: "prefers-color-scheme",
        value: theme === "light" ? "dark" : "light",
      },
    ]);
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#canvas video").src.endsWith(expected),
      {},
      `editing-canvas-${theme === "light" ? "dark" : "light"}.webm`,
    );
    if (!(await page.$eval("#canvas video", (video) => video.paused)))
      throw new Error("Theme change overrode the manual pause.");
    await page.close();
  }
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto(
    `${process.env.BEAM_WEBSITE_URL || "http://127.0.0.1:7000"}/features/editing`,
    { waitUntil: "networkidle0" },
  );
  await page.$eval("#canvas", (element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (!(await page.$eval("#canvas video", (video) => video.paused)))
    throw new Error("Reduced motion unexpectedly started playback.");
  report.push({ reducedMotion: "static poster" });
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
