import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./beam-cli.mjs";
const output = resolve(root, ".beam/verification");
mkdirSync(output, { recursive: true });
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath))
  throw new Error("Set BEAM_CHROMIUM_EXECUTABLE to installed Chromium.");
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Chromium may rerasterize rounded native borders by a few AA values after
// compositing a crossfade. Reject any visible state/geometry difference.
async function sameRaster(page, first, second) {
  if (digest(first) === digest(second)) return true;
  return page.evaluate(
    async (urls) => {
      const frames = await Promise.all(
        urls.map(async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        }),
      );
      let changed = 0;
      for (let i = 0; i < frames[0].length; i += 4) {
        let differs = false;
        for (let c = 0; c < 3; c++) {
          const delta = Math.abs(frames[0][i + c] - frames[1][i + c]);
          if (delta > 8) return false;
          if (delta) differs = true;
        }
        if (differs && ++changed > 512) return false;
      }
      return true;
    },
    [first, second].map(
      (bytes) =>
        "data:image/png;base64," + Buffer.from(bytes).toString("base64"),
    ),
  );
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setRequestInterception(true);
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
  };
  page.on("request", (request) => {
    if (request.url().startsWith("data:")) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, "dist", "." + decodeURIComponent(url.pathname));
    if (
      url.hostname !== "cursor-loop.test" ||
      !path.startsWith(resolve(root, "dist") + "/") ||
      !existsSync(path)
    ) {
      errors.push("Missing/external: " + url.pathname);
      return void request.abort();
    }
    void request.respond({
      status: 200,
      contentType: mime[extname(path)] || "application/octet-stream",
      body: readFileSync(path),
    });
  });
  const results = [];
  for (const theme of ["dark", "light"]) {
    await page.goto(`https://cursor-loop.test/${theme}/index.html`, {
      waitUntil: "networkidle0",
    });
    await page.evaluate(async () => window.beamComposition.ready);
    const seek = async (time) =>
      page.evaluate(async (ms) => {
        await window.beamComposition.seek(ms);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      }, time);
    const background = () =>
      page.$eval(".static-gradient", (canvas) => canvas.toDataURL());
    await seek(0);
    const fixed = digest(await background());
    const gallery = await page.evaluate(() =>
      [...document.querySelectorAll(".cursor-gallery")].map((element) => ({
        pack: element.dataset.galleryPack,
        artwork: element.querySelectorAll("img").length,
        roles: [...element.querySelectorAll("[data-roles]")].flatMap((tile) =>
          tile.dataset.roles.split(","),
        ).length,
        ready: [...element.querySelectorAll("img")].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
        contained: [...element.querySelectorAll("img")].every((image) => {
          const box = image.getBoundingClientRect(),
            panel = document
              .querySelector(".preview-area")
              .getBoundingClientRect();
          return (
            box.left >= panel.left &&
            box.right <= panel.right &&
            box.top >= panel.top &&
            box.bottom <= panel.bottom
          );
        }),
      })),
    );
    if (
      JSON.stringify(
        gallery.map((g) => [g.roles, g.artwork, g.ready, g.contained]),
      ) !==
      JSON.stringify([
        [35, 35, true, true],
        [84, 54, true, true],
      ])
    )
      throw new Error(
        "Incomplete, undecoded or clipped native pack: " +
          JSON.stringify(gallery),
      );
    for (const [time, role] of [
      [2200, "textcursor"],
      [3200, "move"],
      [4200, "resizewesteast"],
      [5100, "cross"],
      [7900, "textcursor"],
      [9000, "resizenorthwestsoutheast"],
      [9800, "notallowed"],
      [10400, "help"],
    ]) {
      await seek(time);
      const visible = await page.$eval(
        ".demo-cursor.primary",
        (cursor, role) =>
          cursor.dataset.role === role &&
          cursor.complete &&
          cursor.naturalWidth > 0,
        role,
      );
      if (!visible)
        throw new Error(`Wrong or undecoded ${theme} ${role} pointer.`);
    }
    for (const time of [950, 5800, 6750, 10950]) {
      await seek(time);
      const hit = await page.evaluate(() => {
        const cursor = document.querySelector(".demo-cursor.primary"),
          box = cursor.getBoundingClientRect(),
          style = getComputedStyle(cursor);
        const [x, y] = style.transformOrigin.split(" ").map(parseFloat),
          scale = box.width / parseFloat(style.width);
        const element = document.elementFromPoint(
          box.x + x * scale,
          box.y + y * scale,
        );
        return (
          !!element?.closest("button") && cursor.dataset.role === "handpointing"
        );
      });
      if (!hit)
        throw new Error(`${theme} click missed its native button at ${time}.`);
    }
    for (const time of [
      0, 950, 2200, 3200, 4200, 5100, 5950, 6500, 7900, 9000, 9800, 10400,
      11090, 12000,
    ]) {
      await seek(time);
      if (digest(await background()) !== fixed)
        throw new Error("The Tide backdrop moved.");
      const first = await page.screenshot({
        path: resolve(output, `${theme}-${time}.png`),
      });
      await seek(0);
      await seek(11900);
      await seek(time);
      const second = await page.screenshot({
        path: resolve(output, `${theme}-${time}-reverse.png`),
      });
      if (!(await sameRaster(page, first, second)))
        throw new Error(`Non-deterministic ${theme} seek at ${time}.`);
    }
    await seek(0);
    const first = await page.screenshot();
    await seek(12000);
    if (digest(first) !== digest(await page.screenshot()))
      throw new Error(`Visible ${theme} loop seam.`);
    results.push({
      theme,
      reverseSeeks: 14,
      rasterTolerance: "Native-border AA only: ≤8/255 on ≤0.05% of pixels",
      loopSeam: "identical pixels",
      cursorTargets: 4,
      completePacks: gallery,
      hotspotRoles:
        "native point, click, text, move, resize, crosshair, unavailable, help",
      backdrop: "fixed Beam Tide",
    });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const report = {
    durationMs: 12000,
    samples: results,
    runtimeErrors: 0,
    externalRequests: 0,
  };
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
