import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  output = resolve(root, ".beam/verification");
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.BEAM_CHROMIUM_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=gl"],
});
const errors = [],
  results = [];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:") return void request.continue();
    const path = resolve(root, "dist", "." + url.pathname),
      mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
        ".mp4": "video/mp4",
      };
    if (
      url.hostname !== "studio.test" ||
      !path.startsWith(resolve(root, "dist") + "/") ||
      !existsSync(path)
    ) {
      errors.push("Missing/external asset: " + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || "application/octet-stream",
      body: readFileSync(path),
    });
  });
  const seek = (ms) =>
    page.evaluate(async (ms) => {
      await window.beamComposition.seek(ms);
    }, ms);
  async function samePixels(first, second) {
    if (digest(first) === digest(second)) return true;
    return page.evaluate(
      async (sources) => {
        const pixels = await Promise.all(
          sources.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = new OffscreenCanvas(1600, 1000),
              ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, 1600, 1000).data;
          }),
        );
        let changed = 0,
          edgePixels = 0;
        const rect = document
          .querySelector(".editor-card")
          .getBoundingClientRect();
        const controls = [...document.querySelectorAll("button,input")]
          .filter((node) => node.offsetHeight > 0)
          .map((node) => node.getBoundingClientRect());
        let controlEdges = 0, playheadEdges = 0;
        const playhead = document.querySelector(".playhead-head").getBoundingClientRect();
        for (let i = 0; i < pixels[0].length; i += 4) {
          let delta = 0;
          for (let c = 0; c < 4; c++)
            delta = Math.max(
              delta,
              Math.abs(pixels[0][i + c] - pixels[1][i + c]),
            );
          if (!delta) continue;
          const x = (i / 4) % 1600,
            y = Math.floor(i / 4 / 1600);
          const edge =
            (Math.min(Math.abs(y - rect.top), Math.abs(y - rect.bottom)) <= 3 &&
              x >= rect.left - 3 &&
              x <= rect.right + 3) ||
            (Math.min(Math.abs(x - rect.left), Math.abs(x - rect.right)) <= 3 &&
              y >= rect.top - 3 &&
              y <= rect.bottom + 3);
          // Chromium changes a single antialiased card-edge row after a clipped camera re-seek.
          // Measured: 736 pixels, delta 15. This allowance never includes UI/media content.
          if (edge && delta <= 20) {
            if (++edgePixels > 2000) return false;
            continue;
          }
          const controlEdge = controls.some(
            (r) =>
              x >= r.left - 2 &&
              x <= r.right + 2 &&
              y >= r.top - 2 &&
              y <= r.bottom + 2 &&
              Math.min(
                Math.abs(x - r.left),
                Math.abs(x - r.right),
                Math.abs(y - r.top),
                Math.abs(y - r.bottom),
              ) <= 4,
          );
          // Measured dark-theme rounded-button AA: 45 pixels, maximum delta 41.
          if (controlEdge && delta <= 48) {
            if (++controlEdges > 64) return false;
            continue;
          }
          // Measured right edge of the native playhead tip: 13 pixels, maximum delta 27.
          if (
            Math.abs(x - playhead.right) <= 2 &&
            y >= playhead.top - 1 && y <= playhead.bottom + 1 && delta <= 32
          ) {
            if (++playheadEdges > 16) return false;
            continue;
          }
          if (delta > 8 || ++changed > 64) return false;
        }
        return true;
      },
      [first, second].map(
        (bytes) =>
          "data:image/png;base64," + Buffer.from(bytes).toString("base64"),
      ),
    );
  }
  for (const theme of ["light", "dark"]) {
    await page.goto(`https://studio.test/${theme}/index.html`, {
      waitUntil: "networkidle0",
    });
    await page.evaluate(async () => window.beamComposition.ready);
    writeFileSync(
      resolve(root, ".beam/final-state.json"),
      JSON.stringify(await page.evaluate(() => window.studioDocument), null, 2),
    );
    for (const [ms, selector] of [
      [1300, ".trim-handle.end"],
      [3050, ".toolbar-split-btn"],
      [5100, ".gap-action button"],
      [5950, ".add-menu button"],
      [6450, ".caption-clip-panel input"],
      [8400, '[data-clip-section="shadow"] .accordion-trigger'],
      [8900, '[data-clip-section="shadow"] input[aria-label="Color"]'],
      [9950, 'input[aria-label="Width"]'],
      [11350, "button.active"],
      [11740, 'button[aria-label="Ocean"]'],
      [12500, ".play-pause-btn"],
    ]) {
      await seek(ms);
      const hit = await page.evaluate((selector) => {
        const pointer = document.querySelector(".demo-cursor"),
          target = document.querySelector(selector);
        if (!target || target.disabled) return false;
        const p = pointer.getBoundingClientRect(),
          r = target.getBoundingClientRect();
        const origin = getComputedStyle(pointer)
          .transformOrigin.split(" ")
          .map(parseFloat);
        const x = p.x + (origin[0] * p.width) / pointer.offsetWidth;
        const y = p.y + (origin[1] * p.height) / pointer.offsetHeight;
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      }, selector);
      if (!hit)
        throw new Error(`Cursor missed native ${selector} at ${ms} (${theme})`);
    }
    const samples = [];
    for (const ms of [
      0, 1800, 3200, 3950, 4700, 5400, 7100, 9100, 10400, 12100, 13600, 15000,
    ]) {
      await seek(ms);
      if (ms === 13600 && theme === "light") {
        const preview = await page.$eval(
          ".preview-surface canvas",
          (canvas) => canvas.toDataURL("image/png").split(",")[1],
        );
        mkdirSync(resolve(root, ".beam/project"), { recursive: true });
        writeFileSync(
          resolve(root, ".beam/project/preview.png"),
          Buffer.from(preview, "base64"),
        );
      }
      const frame = await page.screenshot({
        path: resolve(output, `${theme}-${ms}.png`),
      });
      const state = await page.evaluate(() => {
        const transform = getComputedStyle(
            document.querySelector(".world"),
          ).transform,
          m = new DOMMatrix(transform),
          s = m.a;
        const geometry = (node) => {
          const r = node.getBoundingClientRect();
          return {
            x: (r.x / 1.25 - m.e) / s,
            y: (r.y / 1.25 - m.f) / s,
            w: r.width / 1.25 / s,
            h: r.height / 1.25 / s,
          };
        };
        return {
          mode: document.querySelector(".inspector").dataset.mode,
          buttons: [...document.querySelectorAll("button")]
            .filter((button) => button.offsetHeight > 0)
            .map((button) => ({
              label:
                button.getAttribute("aria-label") || button.textContent.trim(),
              ...geometry(button),
            })),
          inputs: [...document.querySelectorAll("input")]
            .filter((input) => input.offsetHeight > 0)
            .map((input) => ({
              label: input.getAttribute("aria-label"),
              value: input.value,
              ...geometry(input),
            })),
          cursor: document.querySelector(".demo-cursor").outerHTML,
          canvas: geometry(document.querySelector(".preview-surface")),
        };
      });
      writeFileSync(
        resolve(output, `layout-${ms}.json`),
        JSON.stringify(state, null, 2),
      );
      await seek(15000);
      await seek(0);
      await seek(ms);
      const reversed = await page.screenshot();
      if (!(await samePixels(frame, reversed))) {
        writeFileSync(resolve(output, `${theme}-${ms}-reversed.png`), reversed);
        console.error(
          JSON.stringify(
            {
              first: state.cursor,
              after: await page.$eval(".demo-cursor", (node) => node.outerHTML),
            },
            null,
            2,
          ),
        );
        throw new Error(`Non-deterministic pixels at ${ms} (${theme})`);
      }
      samples.push({ ms, ...state });
    }
    await seek(0);
    const first = await page.screenshot();
    // HyperFrames' GSAP seek must settle the same native UI/media as Beam's render adapter.
    await page.evaluate(async () => {
      const pending = [];
      window.__timelines["studio-overview"].seek(9.1);
      window.dispatchEvent(
        new CustomEvent("hf-seek", {
          detail: {
            time: 9.1,
            waitUntil: (work) => pending.push(work),
          },
        }),
      );
      if (pending.length !== 1)
        throw new Error("Native seek barrier was not registered");
      await Promise.all(pending);
    });
    const bridged = await page.screenshot();
    await seek(9100);
    if (!(await samePixels(bridged, await page.screenshot())))
      throw new Error("HyperFrames render barrier diverged: " + theme);
    await seek(15000);
    if (!(await samePixels(first, await page.screenshot())))
      throw new Error("Visible loop seam: " + theme);
    results.push({
      theme,
      samples,
      loopSeam: "matched",
      reverseSeeks: samples.length,
    });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify({ results, runtimeErrors: 0, externalRequests: 0 }, null, 2),
  );
  console.log(
    "Native Studio: light/dark, twelve reversible states, matching loop seam, no external requests or runtime errors.",
  );
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
