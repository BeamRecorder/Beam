import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFile, writeFile, cp, mkdir, rm, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { root } from "./beam-cli.mjs";
const repository = resolve(root, "../..");
const foundations = (
  await readFile(resolve(repository, "apps/desktop/src/style.css"), "utf8")
).match(/^:root(?:\.dark)?\s*\{[\s\S]*?^\}/gm);
await writeFile(
  resolve(root, "src/native-foundations.css"),
  "/* Native Beam foundations copied from apps/desktop/src/style.css. */\n" +
    foundations.join("\n") +
    "\n",
);
const plugins = () => [
  {
    name: "native-film-adapters",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer && source.startsWith('.') && /\/api\/capture(?:\.ts)?$/.test(resolve(dirname(importer), source)))
        return resolve(root, 'src/demo-capture.ts');
      if (source === "virtual:public-background-media")
        return "\0demo-background-catalog";
      if (source === './useHudState' && importer?.endsWith('/hud/HUD.vue'))
        return resolve(root, 'src/hero-hud.ts');
      if (
        source === "./useBeamy" &&
        importer?.includes("/components/brand/Beamy/Beamy.vue")
      )
        return resolve(root, "src/mascot-clock.ts");
    },
    load(id) {
      if (id === "\0demo-background-catalog")
        return "export default {images:[],videos:[]};";
    },
  },
  vue(),
];
const aliases = [
  { find: "~/api/capture", replacement: resolve(root, "src/demo-capture.ts") },
  {
    find: "~/utils/public-asset",
    replacement: resolve(root, "src/demo-public-assets.ts"),
  },
  {
    find: "~/ui",
    replacement: resolve(repository, "apps/desktop/src/components/ui"),
  },
  { find: "~", replacement: resolve(repository, "apps/desktop/src") },
  { find: "vue", replacement: resolve(root, "node_modules/vue") },
];
// A self-contained iframe preserves native popover coordinates at 2× capture.
// Inline assets also survive the real CLI's independent motion bundling pass.
await build({
  root,
  configFile: false,
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  plugins: plugins(),
  resolve: { dedupe: ["vue"], alias: aliases },
  build: {
    outDir: resolve(root, ".beam/native"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Infinity,
    minify: true,
    lib: {
      entry: resolve(root, "src/main.ts"),
      formats: ["es"],
      fileName: "native",
    },
    rollupOptions: { output: { codeSplitting: false } },
  },
});
const nativeJs = (
  await readFile(resolve(root, ".beam/native/native.js"), "utf8")
).replaceAll("</script", "<\/script");
const nativeCss = (
  await readFile(resolve(root, ".beam/native/native.css"), "utf8")
).replace(/(?:transition|animation)(?:-[a-z-]+)?\s*:[^;{}]+;?/g, "");
const nativeHtml = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><link rel="icon" href="data:,"><title>Native Beam Instant</title><style>${nativeCss}</style></head><body><div id="native-root" data-composition-id="instant-native" data-width="640" data-height="400" data-duration="8"><div id="app" class="clip" data-start="0" data-duration="8" data-track-index="0"></div></div><script type="module">${nativeJs}window.__timelines['instant-native']=window.beamComposition.timeline;</script></body></html>`;
await writeFile(resolve(root, ".beam/native-host.html"), nativeHtml);
const entries = [];
for (const mode of ["presets", "export", "clipboard", "hero"])
  for (const theme of ["dark", "light"]) {
    const attrs = `${theme === "dark" ? 'class="dark" ' : ""}data-demo-theme="${theme}" data-demo-mode="${mode}"`;
    const duration = mode === 'hero' ? 24 : 8;
    const html = `<!doctype html><html lang="en" ${attrs}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beam · Instant</title><link rel="icon" href="data:,"><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--color-bg-surface)}iframe{display:block;width:640px;height:400px;border:0;transform:scale(2);transform-origin:0 0}</style></head><body><div id="root" data-composition-id="instant" data-width="1280" data-height="800" data-duration="${duration}"><iframe id="instant-controls" class="clip" data-start="0" data-duration="${duration}" data-track-index="0" title="Native Beam Instant controls"></iframe></div><script type="module" src="./src/parent.ts"></script></body></html>`;
    const path = resolve(root, `${mode}-${theme}.html`);
    await writeFile(path, html);
    entries.push(path);
  }
await build({
  root,
  configFile: false,
  base: "./",
  publicDir: false,
  plugins: [vue()],
  resolve: { dedupe: ["vue"], alias: aliases },
  build: {
    outDir: resolve(root, ".beam/build"),
    emptyOutDir: true,
    rollupOptions: { input: entries },
  },
});
await rm(resolve(root, "dist"), { recursive: true, force: true });
for (const mode of ["presets", "export", "clipboard", "hero"])
  for (const theme of ["dark", "light"]) {
    const name = `${mode}-${theme}`,
      dest = resolve(root, "dist", name);
    await mkdir(dest, { recursive: true });
    await cp(resolve(root, ".beam/build/assets"), resolve(dest, "assets"), {
      recursive: true,
    });
    let html = await readFile(
      resolve(root, ".beam/build", `${name}.html`),
      "utf8",
    );
    const pattern = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g;
    const imports = [...html.matchAll(pattern)]
      .map((match) => `import '${match[1]}';`)
      .join("\n");
    html = html
      .replace(pattern, "")
      .replace(
        "</head>",
        `<script type="module">${imports}\nwindow.__timelines['instant']=window.beamComposition.timeline;</script></head>`,
      );
    await writeFile(resolve(dest, "index.html"), html);
    const nativeCheck = resolve(root, ".beam/native-check", name);
    await mkdir(nativeCheck, {recursive:true});
    const checkHtml = nativeHtml.replace(
      `<script type="module">${nativeJs}window.__timelines['instant-native']=window.beamComposition.timeline;</script>`,
      '<script type="module">import "./native.js";window.__timelines["instant-native"]=window.beamComposition.timeline;</script>',
    );
    await cp(resolve(root, '.beam/native/native.js'), resolve(nativeCheck, 'native.js'));
    await writeFile(
      resolve(nativeCheck, "index.html"),
      checkHtml.replace(
        '<html lang="en">',
        `<html lang="en" ${attrsFor(mode, theme)}>`,
      ).replaceAll('data-duration="8"', `data-duration="${mode === 'hero' ? 24 : 8}"`),
    );
    await cp(
      resolve(root, "assets/HankenGrotesk-OFL.txt"),
      resolve(dest, "HankenGrotesk-OFL.txt"),
    );
  }
function attrsFor(mode, theme) {
  return `${theme === "dark" ? 'class="dark" ' : ""}data-demo-mode="${mode}"`;
}
