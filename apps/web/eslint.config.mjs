import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { noTailwindHardcodedColorsRule } from "./eslint-rules/no-tailwind-hardcoded-colors.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      thunder: {
        rules: {
          "no-tailwind-hardcoded-colors": noTailwindHardcodedColorsRule,
        },
      },
    },
    rules: {
      "thunder/no-tailwind-hardcoded-colors": "error",
      // Allow native img for favicon icons (small external images)
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
