import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

import { baseConfig } from "@focusmakers/config/eslint/base";

export default [
  {
    ignores: [
      "dist",
      // MediaPipe wasm 런타임의 복사본(scripts/copyMediapipeWasm.js가 채운다). 생성물이고
      // Emscripten이 뱉은 미니파이 글루 JS라 검사하면 규칙 위반만 수천 건 나온다.
      // apps/mobile이 assets/web-dist를 같은 이유로 제외한다.
      "public/mediapipe/**",
    ],
  },
  js.configs.recommended,
  ...baseConfig,
  {
    // 빌드 스크립트는 브라우저가 아니라 Node에서 돈다 — `process`·`console`을 쓴다.
    // 여기서 globals를 주지 않으면 `no-undef`가 그 둘을 미정의 식별자로 잡는다.
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
];
