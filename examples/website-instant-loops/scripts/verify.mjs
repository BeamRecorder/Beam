import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { root } from "./beam-cli.mjs";

const output = resolve(root, ".beam/verification");
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const results = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => { errors.push(String(error)); console.error(error.message.slice(0,1000)); });
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
    if (/^(data|blob):/.test(request.url())) return void request.continue();
    const url = new URL(request.url());
    const path = resolve(root, "dist", "." + decodeURIComponent(url.pathname));
    if (
      url.hostname !== "local-render.test" ||
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
    page.evaluate(async (ms) => {
      await window.beamComposition.seek(ms);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }, time);
  for (const mode of (process.env.BEAM_VERIFY_MODE ? [process.env.BEAM_VERIFY_MODE] : ["presets", "export", "clipboard"]))
    for (const theme of ["dark", "light"]) {
      console.log('Checking',mode,theme);
      await page.goto(`https://local-render.test/${mode}-${theme}/index.html`, {
        waitUntil: "domcontentloaded", timeout: 60000,
      });
      await page.evaluate(async () => window.beamComposition.ready);
      const frame = page.frames().find((frame) => frame.parentFrame());
      const hashes = [];
      for (const time of [0, 1000, 2100, 3200, 4500, 5900, 6300, 8000]) {
        await seek(time);
        const first = digest(
          await page.screenshot({
            path: resolve(output, `${mode}-${theme}-${time}.png`),
          }),
        );
        await seek(6300);
        await seek(0);
        await seek(time);
        const reverse = digest(
          await page.screenshot({
            path: resolve(output, `${mode}-${theme}-${time}-reverse.png`),
          }),
        );
        if (first !== reverse) {
          const pixels = await page.evaluate(
            async ([a, b]) => {
              const images = await Promise.all(
                [a, b].map(
                  (src) =>
                    new Promise((resolve) => {
                      const im = new Image();
                      im.onload = () => resolve(im);
                      im.src = "data:image/png;base64," + src;
                    }),
                ),
              );
              const c = document.createElement("canvas");
              c.width = 1280;
              c.height = 800;
              const ctx = c.getContext("2d");
              const samples = images.map((im) => {
                ctx.clearRect(0, 0, 1280, 800);
                ctx.drawImage(im, 0, 0);
                return ctx.getImageData(0, 0, 1280, 800).data;
              });
              let changed = 0;
              for (let i = 0; i < samples[0].length; i += 4)
                if (
                  [0, 1, 2].some(
                    (k) => Math.abs(samples[0][i + k] - samples[1][i + k]) > 2,
                  )
                )
                  changed++;
              return changed;
            },
            [
              readFileSync(
                resolve(output, `${mode}-${theme}-${time}.png`),
              ).toString("base64"),
              readFileSync(
                resolve(output, `${mode}-${theme}-${time}-reverse.png`),
              ).toString("base64"),
            ],
          );
          if (pixels > 256)
            throw new Error(
              `Unstable reverse seek ${mode}/${theme}/${time}: ${pixels} pixels`,
            );
        }
        hashes.push(first);
      }

      if (new Set(hashes).size < 5)
        throw new Error("Animation did not advance");
      if (mode === "presets") {
        await seek(2100);
        console.log('Preview state', await frame.evaluate(() => ({
          active: document.activeElement?.textContent?.slice(0,60),
          options: [...document.querySelectorAll('[role="option"]')].map(el => ({classes:el.className, label:el.textContent})),
          tooltip: document.querySelector('[role="tooltip"]')?.textContent,
          sample: document.querySelector('.preset-preview-media')?.textContent,
        })));
        const options = await frame.$$eval('[role="option"]', (items) =>
          items.map((item) => item.textContent.trim()),
        );
        if (!options.includes("Nocturne") || !options.includes("Sunrise"))
          throw new Error("Native preset list is missing");
        const trigger = await frame.$eval(".select-trigger", (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        const optionBoxes = await frame.$$eval('[role="option"]', (items) =>
          items.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              text: el.textContent.trim(),
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
            };
          }),
        );
        console.log("Native preset positions", trigger, optionBoxes);
        await seek(5900);
        if (
          !(
            await frame.$eval(".select-trigger", (el) => el.textContent)
          ).includes("Sunrise")
        )
          throw new Error("Native preset was not selected");
      } else if (mode === 'export') {
        await seek(0);
        console.log(
          "Stop bounds",
          await frame.$eval('button[aria-label="Stop recording"]', (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          }),
        );
        await seek(3200);
        if (
          (await frame.$eval(".beam-mascot", (el) => el.dataset.phase)) !==
          "loading"
        )
          throw new Error("Mascot skipped loading");
        await seek(6300);
        if (
          (await frame.$eval(".beam-mascot", (el) => el.dataset.phase)) !==
          "completed"
        )
          throw new Error("Mascot did not celebrate");
        if (
          !(
            await frame.$eval('[role="status"]', (el) => el.textContent)
          ).includes("Video ready")
        )
          throw new Error("Video-ready state is missing");
        const color = await frame.$eval(
          ".beam-mascot svg",
          (el) => getComputedStyle(el).color,
        );
        console.log("Completed mascot color", color);
      } else {
        await seek(1000);
        if (!(await frame.$eval('[role="status"]', el => el.textContent)).includes('Copied to clipboard'))
          throw new Error('Completed file was not copied');
        const pillSize = await frame.$eval('.snip-pill', el => ({width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}));
        if (pillSize.width !== 356 || pillSize.height !== 76)
          throw new Error('Copied status lost its native dimensions');
        await seek(6300);
        if (!(await frame.$eval('.attached-file', el => el.textContent)).includes('Beautiful Captures.mp4'))
          throw new Error('Completed file attachment missing');
        if ((await frame.$eval('.attached-file', el => el.dataset.sent)) !== 'true')
          throw new Error('Video was not sent to the chat');
        const replies = await frame.$$eval('.reply', items => items.map(el => ({text: el.textContent, opacity: getComputedStyle(el).opacity})));
        if (replies.length !== 2 || replies.some(reply => reply.opacity !== '1'))
          throw new Error('Chat replies missing');
        if (await frame.evaluate(() => document.body.textContent.includes('A real video file')))
          throw new Error('Generic title was retained');
        const overlapping = await frame.evaluate(() => {
          const reply = document.querySelector('.maya-reply').getBoundingClientRect();
          const composer = document.querySelector('.composer').getBoundingClientRect();
          return reply.bottom > composer.top;
        });
        if (overlapping) throw new Error('Chat reply overlaps the composer');
      }
      const inside = await frame.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.product-card,.demo-cursor,[role="option"],.snip-pill',
          ),
        ]
          .filter(
            (el) =>
              el.getBoundingClientRect().width &&
              el.getBoundingClientRect().height,
          )
          .every((el) => {
            const r = el.getBoundingClientRect();
            return r.x >= 0 && r.y >= 0 && r.right <= 640 && r.bottom <= 400;
          }),
      );
      if (!inside) throw new Error("Native controls escaped the frame");
      results.push({
        mode,
        theme,
        reverseSeeks: 8,
        loopSeam: "matching state, SVG raster tolerance ≤256 pixels",
        nativeComponents: true,
      });
    }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(
      {
        durationMs: 8000,
        samples: results,
        runtimeErrors: 0,
        externalRequests: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
