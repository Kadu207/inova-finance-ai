import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      // lcovonly: relatório consumido pelo SonarCloud (sonar.javascript.lcov.reportPaths).
      // text: resumo no log do CI.
      reporter: ["text", "lcovonly"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/dev-node.ts", "src/local-env.ts"],
    },
  },
});
