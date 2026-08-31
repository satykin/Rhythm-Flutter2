import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/** Flat-конфиг ESLint: TS strict, никаких `any` (требование аудита). */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "public/sw.js", "*.config.*"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_|^React$" },
      ],
    },
  }
);
