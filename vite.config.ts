import { defineConfig } from "vite";
import type { Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const PUBLIC_BACKGROUND_MEDIA_MODULE = "virtual:public-background-media";
const RESOLVED_PUBLIC_BACKGROUND_MEDIA_MODULE = "\0" + PUBLIC_BACKGROUND_MEDIA_MODULE;
const PUBLIC_MEDIA_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4v",
  ".mov",
  ".mp4",
  ".ogv",
  ".png",
  ".webm",
  ".webp",
]);

const collectPublicBackgroundMedia = (directory: string, publicRoot: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...collectPublicBackgroundMedia(absolutePath, publicRoot));
      continue;
    }
    if (!entry.isFile() || !PUBLIC_MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    const publicPath = path.relative(publicRoot, absolutePath).split(path.sep).join('/');
    paths.push(`/${publicPath}`);
  }

  return paths.sort();
};

const publicBackgroundMediaPlugin = (): Plugin => ({
  name: "public-background-media",
  resolveId(id) {
    return id === PUBLIC_BACKGROUND_MEDIA_MODULE ? RESOLVED_PUBLIC_BACKGROUND_MEDIA_MODULE : undefined;
  },
  load(id) {
    if (id !== RESOLVED_PUBLIC_BACKGROUND_MEDIA_MODULE) return undefined;
    const publicRoot = fileURLToPath(new URL("./public", import.meta.url));
    const paths = collectPublicBackgroundMedia(publicRoot, publicRoot);
    return `export default ${JSON.stringify(paths)};`;
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [publicBackgroundMediaPlugin(), vue({})],
  resolve: {
    alias: {
      "~/ui": fileURLToPath(new URL("./src/components/ui", import.meta.url)),
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 6500,
  },
});
