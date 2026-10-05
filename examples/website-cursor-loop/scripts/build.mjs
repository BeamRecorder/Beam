import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFile, writeFile, cp, mkdir, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { root } from "./beam-cli.mjs";
const repository = resolve(root, "../..");
const html = await readFile(resolve(root, "index.html"), "utf8");
await writeFile(
  resolve(root, "light.html"),
  html.replace(
    'class="dark" data-demo-theme="dark"',
    'data-demo-theme="light"',
  ),
);
await build({
  root,
  configFile: false,
  base: "./",
  publicDir: false,
  plugins: [vue()],
  resolve: {
    dedupe: ["vue"],
    alias: {
      "~/utils/public-asset": resolve(root, "src/public-asset.ts"),
      "~/ui": resolve(repository, "apps/desktop/src/components/ui"),
      "~": resolve(repository, "apps/desktop/src"),
      vue: resolve(root, "node_modules/vue"),
    },
  },
  build: {
    outDir: resolve(root, ".beam/build"),
    emptyOutDir: true,
    rollupOptions: {
      input: [resolve(root, "index.html"), resolve(root, "light.html")],
    },
  },
});
await rm(resolve(root, "dist"), { recursive: true, force: true });
for (const theme of ["dark", "light"]) {
  const destination = resolve(root, "dist", theme);
  await mkdir(destination, { recursive: true });
  await cp(
    resolve(root, ".beam/build/assets"),
    resolve(destination, "assets"),
    { recursive: true },
  );
  let entry = await readFile(
    resolve(
      root,
      ".beam/build",
      theme === "dark" ? "index.html" : "light.html",
    ),
    "utf8",
  );
  entry = entry.replace(
    /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
    (_, src) =>
      `<script type="module">import '${src}';\nwindow.__timelines['editing-cursor'] = window.beamComposition.timeline;</script>`,
  );
  await writeFile(resolve(destination, "index.html"), entry);
  for (const asset of await readdir(resolve(destination, "assets"))) {
    if (!asset.endsWith(".css")) continue;
    const path = resolve(destination, "assets", asset);
    // Native controls are presentational here; GSAP is the only render clock.
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(/transition\s*:[^;{}]+;?/g, ""),
    );
  }
  await cp(
    resolve(root, "assets/HankenGrotesk-OFL.txt"),
    resolve(destination, "HankenGrotesk-OFL.txt"),
  );
}
