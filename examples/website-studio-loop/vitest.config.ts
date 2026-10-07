import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const desktop = fileURLToPath(
  new URL("../../apps/desktop/src", import.meta.url),
);
export default defineConfig({
  plugins: [
    {
      name: "frozen-catalog-tests",
      resolveId(id) {
        if (id === "virtual:public-background-media")
          return "\0test-wallpapers";
      },
      load(id) {
        if (id === "\0test-wallpapers")
          return "export default {images:[],videos:[]}";
      },
    },
  ],
  resolve: { alias: { "~/ui": desktop + "/components/ui", "~": desktop } },
  test: {
    include: ["tests/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/motion.ts", "src/scene-model.ts"],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reporter: ["text", "json-summary"],
      reportsDirectory: ".beam/coverage",
    },
  },
});
