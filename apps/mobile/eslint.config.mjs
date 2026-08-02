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
      // Expo CNG 생성물 — prebuild가 매번 다시 만든다.
      "ios/**",
      "android/**",
    ],
  },
];
