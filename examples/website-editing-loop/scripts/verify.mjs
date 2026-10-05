import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".beam/verification");
mkdirSync(output, { recursive: true });
const executablePath = process.env.BEAM_CHROMIUM_EXECUTABLE;
if (!executablePath || !existsSync(executablePath))
  throw new Error("Set BEAM_CHROMIUM_EXECUTABLE to an installed Chromium.");
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml",
  };
  page.on("request", (request) => {
    if (request.url().startsWith("data:")) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, "dist", "." + decodeURIComponent(url.pathname));
    if (
      url.hostname !== "editing-loop.test" ||
      !path.startsWith(resolve(root, "dist") + "/") ||
      !existsSync(path)
    ) {
      errors.push("Missing or external asset: " + url.pathname);
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
    await page.goto(`https://editing-loop.test/${theme}/index.html`, {
      waitUntil: "networkidle0",
    });
    await page.evaluate(async () => window.beamComposition.ready);
    const gradientRendered = await page.$eval(".static-gradient", (canvas) => {
      const context = canvas.getContext("2d");
      const corners = [
        [0, 0],
        [1279, 0],
        [0, 799],
        [1279, 799],
        [640, 400],
      ].map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
      const greens = corners.map((color) => color[1]);
      return (
        corners.every((color) => color[3] === 255) &&
        Math.max(...greens) - Math.min(...greens) > 24
      );
    });
    if (!gradientRendered)
      throw new Error(`The ${theme} Beam gradient was not painted.`);
    const seek = async (time) =>
      page.evaluate(async (timeMs) => {
        await window.beamComposition.seek(timeMs);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      }, time);
    for (const [time, role] of [
      [350, "default"],
      [700, "resizewesteast"],
      [1300, "resizewesteast"],
      [2000, "resizewesteast"],
      [2400, "default"],
      [3000, "default"],
    ]) {
      await seek(time);
      const cursor = await page.$eval(".demo-cursor", (element) => {
        const images = Array.from(element.querySelectorAll("img"));
        const style = getComputedStyle(element),
          rect = element.getBoundingClientRect();
        const [x, y] = style.transformOrigin.split(" ").map(parseFloat);
        const scale = rect.width / parseFloat(style.width);
        const handle = document
          .querySelector(".native-grip .trim-handle")
          .getBoundingClientRect();
        const badge = document.querySelector(".trim-side-badge").getBoundingClientRect();
        const anchorX = rect.x + x * scale,
          anchorY = rect.y + y * scale;
        return {
          role: element.dataset.cursorRole,
          spritesReady:
            images.length === 2 &&
            images.every(
              (image) => image.complete && image.naturalWidth === 32,
            ),
          visibleSprites: images.filter(
            (image) => getComputedStyle(image).display !== "none",
          ).length,
          onHandle:
            Math.abs(anchorX - (handle.x + handle.width / 2)) < 1 &&
            anchorY >= handle.top &&
            anchorY <= handle.bottom,
          badgeClear: badge.right <= rect.left,
        };
      });
      if (
        cursor.role !== role ||
        !cursor.spritesReady ||
        cursor.visibleSprites !== 1
      )
        throw new Error(
          `Incorrect ${theme} macOS cursor at ${time}ms: ${JSON.stringify(cursor)}`,
        );
      if (role === "resizewesteast" && (!cursor.onHandle || !cursor.badgeClear))
        throw new Error(
          `The ${theme} resize hotspot left the trim handle at ${time}ms.`,
        );
    }
    const backdrop = () =>
      page.$eval(".static-gradient", (canvas) => {
        const { x, y, width, height } = canvas.getBoundingClientRect();
        return JSON.stringify({
          bitmap: canvas.toDataURL(),
          x,
          y,
          width,
          height,
        });
      });
    await seek(0);
    const fixedBackdrop = digest(await backdrop());
    for (const time of [0, 700, 1300, 1900, 2400, 3000, 3500, 4600, 5000]) {
      await seek(time);
      if (digest(await backdrop()) !== fixedBackdrop)
        throw new Error(`The ${theme} gradient moved at ${time}ms.`);
      const first = await page.screenshot({
        path: resolve(output, `${theme}-${time}.png`),
      });
      await seek(4900);
      await seek(0);
      await seek(time);
      const second = await page.screenshot();
      if (digest(first) !== digest(second))
        throw new Error(`Non-deterministic ${theme} seek at ${time}ms.`);
    }
    await seek(0);
    const first = await page.screenshot();
    await seek(5000);
    const last = await page.screenshot();
    if (digest(first) !== digest(last))
      throw new Error(`Visible ${theme} loop seam.`);
    results.push({
      theme,
      reverseSeeks: 9,
      cursor: "native macOS arrow and horizontal resize, aligned hotspots",
      loopSeam: "identical pixels",
      backdrop: "fixed Beam Ember gradient",
    });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const report = {
    durationMs: 5000,
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
