import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // No jsdom — these tests call the real API directly, no DOM needed
  },
})
