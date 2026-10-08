import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  resolve: { alias: { "@": src } },
  test: {
    projects: [
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "rules",
          include: ["tests/rules/**/*.test.ts"],
          environment: "node",
          testTimeout: 20000,
          fileParallelism: false,
        },
      },
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30000,
          fileParallelism: false,
        },
      },
      {
        resolve: { alias: { "@": src } },
        test: {
          name: "golden",
          include: ["tests/golden/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/**/*.test.ts"],
    },
  },
})
