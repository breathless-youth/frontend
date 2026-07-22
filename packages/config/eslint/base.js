// @ts-check
import tseslint from "typescript-eslint";

export const sharedIgnores = [
  "dist/**",
  "build/**",
  ".expo/**",
  ".turbo/**",
  "coverage/**",
  "node_modules/**",
];

/**
 * Rule tweaks only — no plugin registration. Use this to layer our
 * conventions on top of a framework preset that already sets up
 * @typescript-eslint itself (e.g. eslint-config-expo). Mixing this with
 * `baseConfig` in the same array double-registers the plugin and ESLint
 * throws "Cannot redefine plugin".
 */
export const customRules = /** @type {import("typescript-eslint").ConfigWithExtends} */ ({
  files: ["**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": "warn",
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
});

/**
 * Self-contained TypeScript base config for packages with no
 * framework-specific ESLint preset of their own (e.g. packages/types).
 */
export const baseConfig = tseslint.config(
  { ignores: sharedIgnores },
  ...tseslint.configs.recommended,
  customRules,
);
