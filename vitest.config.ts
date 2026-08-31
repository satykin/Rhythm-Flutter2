import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest: доменные тесты — чистые (node-совместимые),
 * UI-тесты (*.test.tsx) — в jsdom. Покрытие v8 — по доменным слоям.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/features/**/domain/**/*.{ts,tsx}", "src/features/**/data/**/*.ts"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
    },
  },
});
