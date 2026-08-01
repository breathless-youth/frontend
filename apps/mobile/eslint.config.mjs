import expoConfig from "eslint-config-expo/flat.js";

import { customRules, sharedIgnores } from "@focusmakers/config/eslint/base";

export default [
  ...expoConfig,
  customRules,
  {
    ignores: [
      ...sharedIgnores,
      "expo-env.d.ts",
      "nativewind-env.d.ts",
      // apps/web 빌드 산출물의 복사본(scripts/syncWebDist.js가 채운다). 생성물이고
      // 번들된 미니파이 JS라 검사하면 규칙 위반만 수백 건 나온다.
      "assets/web-dist/**",
      // Expo CNG 생성물 — prebuild가 매번 다시 만든다.
      "ios/**",
      "android/**",
    ],
  },
];
