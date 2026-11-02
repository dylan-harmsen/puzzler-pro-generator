import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths work on a GitHub Pages project URL, whatever the repo is called.
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
