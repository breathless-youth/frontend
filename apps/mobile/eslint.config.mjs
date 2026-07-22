import expoConfig from "eslint-config-expo/flat.js";

import { customRules, sharedIgnores } from "@focuson/config/eslint/base";

export default [
  ...expoConfig,
  customRules,
  {
    ignores: [...sharedIgnores, "expo-env.d.ts", "nativewind-env.d.ts"],
  },
];
