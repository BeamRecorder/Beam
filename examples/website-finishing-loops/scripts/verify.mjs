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
const errors = [],
  results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
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
    const url = new URL(request.url()),
      path = resolve(root, "dist", "." + decodeURIComponent(url.pathname));
    if (
      url.hostname !== "finishing-loop.test" ||
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
  const seek = async (time) =>
    page.evaluate(async (time) => {
      await window.beamComposition.seek(time);
    }, time);
  async function samePixels(first, second) {
    if (digest(first) === digest(second)) return true;
    // Chromium's rounded native borders can vary by a handful of antialias pixels.
    // Keep the allowance to 128 of 1,024,000 pixels and 8/255 per channel.
    return page.evaluate(
      async (sources) => {
        const pixels = await Promise.all(
          sources.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = new OffscreenCanvas(1280, 800),
              context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, 1280, 800).data;
          }),
        );
        let changed = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          let delta = 0;
          for (let c = 0; c < 4; c++)
            delta = Math.max(
              delta,
              Math.abs(pixels[0][i + c] - pixels[1][i + c]),
            );
          if (delta > 8) return false;
          if (delta && ++changed > 128) return false;
        }
        return true;
      },
      [first, second].map(
        (bytes) =>
          "data:image/png;base64," + Buffer.from(bytes).toString("base64"),
      ),
    );
  }
  for (const mode of ["transitions", "export"])
    for (const theme of ["dark", "light"]) {
      await page.goto(
        `https://finishing-loop.test/${mode}-${theme}/index.html`,
        {
          waitUntil: "networkidle0",
        },
      );
      await page.evaluate(async () => window.beamComposition.ready);
      const backdrop = () =>
        page.$eval(".static-gradient", (canvas) => canvas.toDataURL());
      const fixedBackdrop = digest(await backdrop());
      for (const time of [
        0, 750, 1700, 2800, 4000, 5100, 5650, 6200, 6700, 7100, 7400, 7600,
        8000,
      ]) {
        await seek(time);
        if (digest(await backdrop()) !== fixedBackdrop)
          throw new Error("The gradient moved.");
        const first = await page.screenshot({
          path: resolve(output, `${mode}-${theme}-${time}.png`),
        });
        await seek(7200);
        await seek(0);
        await seek(time);
        const second = await page.screenshot();
        if (!(await samePixels(first, second))) {
          writeFileSync(
            resolve(output, `${mode}-${theme}-${time}-repeat.png`),
            second,
          );
          throw new Error(`Non-deterministic ${mode}/${theme} at ${time}ms.`);
        }
      }
      await seek(0);
      const first = await page.screenshot();
      await seek(8000);
      const last = await page.screenshot();
      if (!(await samePixels(first, last)))
        throw new Error(`Visible ${mode}/${theme} loop seam.`);
      const clicks =
        mode === "transitions"
          ? [
              [750, "slide"],
              [1700, "duration"],
              [2800, "zoom"],
              [4000, "blur"],
              [5100, "canvas"],
              [5650, "zoom"],
              [6200, "text"],
            ]
          : [
              [700, "open-export"],
              [1450, "webm"],
              [2000, "mp4"],
              [2700, "resolution"],
              [3400, "fps"],
              [4100, "quality"],
              [4800, "export-video"],
            ];
      const targets = [];
      for (const [time, target] of clicks) {
        await seek(time - 1);
        targets.push(
          await page.evaluate(
            ({ target, time }) => {
              let control = document.querySelector(`[data-target="${target}"]`),
                cursor = document.querySelector(".demo-cursor");
              if (["slide", "zoom", "blur"].includes(target))
                control = Array.from(
                  document.querySelectorAll('button[role="radio"]'),
                ).find((button) =>
                  button.textContent
                    .trim()
                    .startsWith(
                      { slide: "Slide left", zoom: "Zoom in", blur: "Blur" }[
                        target
                      ],
                    ),
                );
              if (target === "duration")
                control = document.querySelector(".duration-slider");
              if (control?.querySelector("button"))
                control = control.querySelector("button");
              if (!control)
                throw new Error("Missing actual native control " + target);
              const c = control.getBoundingClientRect(),
                r = cursor.getBoundingClientRect(),
                style = getComputedStyle(cursor);
              const [x, y] = style.transformOrigin.split(" ").map(parseFloat),
                scale = r.width / parseFloat(style.width);
              const tip = { x: r.left + x * scale, y: r.top + y * scale };
              return {
                target,
                control: {
                  x: c.x / 2,
                  y: c.y / 2,
                  w: c.width / 2,
                  h: c.height / 2,
                },
                tip: { x: tip.x / 2, y: tip.y / 2 },
                onTarget:
                  tip.x >= c.left &&
                  tip.x <= c.right &&
                  tip.y >= c.top &&
                  tip.y <= c.bottom,
              };
            },
            { target, time },
          ),
        );
      }
      if (targets.some((target) => !target.onTarget))
        throw new Error(
          `A ${mode}/${theme} click missed its actual native control: ${JSON.stringify(targets)}`,
        );
      const spritesReady = await page.$$eval(".demo-cursor img", (sprites) =>
        sprites.every(
          (sprite) => sprite.complete && sprite.naturalWidth === 32,
        ),
      );
      if (!spritesReady)
        throw new Error("Native cursor assets did not decode.");
      results.push({
        mode,
        theme,
        reverseSeeks: 13,
        loopSeam:
          "identical state; native-border antialias tolerance <=128 pixels, <=8/255",
        backdrop: mode === "transitions" ? "Aurora" : "Ember",
        targets,
      });
    }
  if (errors.length) throw new Error(errors.join("\n"));
  const report = { results, runtimeErrors: 0, externalRequests: 0 };
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
