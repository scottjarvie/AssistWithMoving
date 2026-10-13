import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Local Live/Sandbox build output and the generated Sandbox backend snapshot.
    ".next-local-*/**",
    "sandbox-backend/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "convex/_generated/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
