import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

/** Flat-конфиг ESLint: TS strict, никаких `any` (требование аудита).
 *  react-hooks / react-refresh подключены, чтобы правила реально работали
 *  (без «Definition for rule not found»). */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "public/sw.js", "*.config.*"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_|^React$" },
      ],
      /* Базовое правило хуков — нарушения являются реальными багами. */
      "react-hooks/rules-of-hooks": "error",
      /* exhaustive-deps намеренно выключен: кодовая база писалась без него,
       * включение потребует отдельного lint-прохода (см. TEST_REPORT). */
      "react-hooks/exhaustive-deps": "off",
      /* Плагин подключён (правило доступно), но выключено: смешанный экспорт
       * компонентов и хелперов — осознанный паттерн проекта. */
      "react-refresh/only-export-components": "off",
    },
  }
);
