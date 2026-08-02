import expoConfig from "eslint-config-expo/flat.js";
import globals from "globals";

import { customRules, sharedIgnores } from "@focusmakers/config/eslint/base";

export default [
  ...expoConfig,
  customRules,
  {
    // 에셋 생성 스크립트는 앱 번들이 아니라 Node에서 돈다 — `Buffer`·`require`를 쓴다.
    // 여기서 globals를 주지 않으면 `no-undef`가 잡는다 (apps/web의 scripts/** 처리와 동일).
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    ignores: [
      ...sharedIgnores,
      "expo-env.d.ts",
      "nativewind-env.d.ts",
      // Expo CNG 생성물 — prebuild가 매번 다시 만든다.
      "ios/**",
      "android/**",
    ],
  },
];
