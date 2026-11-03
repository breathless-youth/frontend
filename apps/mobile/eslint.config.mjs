import expoConfig from "eslint-config-expo/flat.js";
import globals from "globals";

import { customRules, sharedIgnores } from "@focusmakers/config/eslint/base";

// 셸 사용자 문구는 lib/i18n.ts에 두고 t()로 읽는다.
// 로그와 오류 객체는 사용자에게 보이지 않아 한국어로 두므로 console 호출·throw·new Error 안은 건너뛴다.
// 웹처럼 파일 단위로 빼면 로그와 사용자 문구가 함께 있는 화면 파일까지 검사에서 빠진다.
const HANGUL_MESSAGE = "셸 사용자 문구는 lib/i18n.ts에 두고 t()로 읽는다";
const NOT_LOG =
  ":not(CallExpression[callee.object.name='console'] *):not(ThrowStatement *):not(NewExpression[callee.name='Error'] *)";

export default [
  ...expoConfig,
  customRules,
  {
    // 에셋 생성 스크립트와 Expo config 플러그인은 앱 번들이 아니라 Node에서 돈다
    // — `Buffer`·`require`를 쓴다. 여기서 globals를 주지 않으면 `no-undef`가 잡는다
    // (apps/web의 scripts/** 처리와 동일). 플러그인은 prebuild 시점에 Node가 require 한다.
    files: ["scripts/**/*.js", "plugins/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    // app.config.ts는 빌드 오류 메시지만 한국어다.
    ignores: ["lib/i18n.ts", "app.config.ts", "jest/**", "**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=/[가-힣]/]${NOT_LOG}`, message: HANGUL_MESSAGE },
        { selector: `TemplateElement[value.raw=/[가-힣]/]${NOT_LOG}`, message: HANGUL_MESSAGE },
        { selector: "JSXText[value=/[가-힣]/]", message: HANGUL_MESSAGE },
      ],
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
