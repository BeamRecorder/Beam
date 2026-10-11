import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/motion.ts",
        "src/hero-motion.ts",
        "src/demo-capture.ts",
        "src/mascot-clock.ts",
        "src/demo-public-assets.ts",
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reporter: ["text", "json-summary"],
      reportsDirectory: ".beam/coverage",
    },
  },
});
