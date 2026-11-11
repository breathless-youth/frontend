import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

import { baseConfig } from "@focusmakers/config/eslint/base";

// 사용자에게 보이는 문구는 모두 카탈로그에서 읽는다.
const I18N_ENFORCED = ["src/**/*.{ts,tsx}"];
// 약관·개인정보처리방침 본문은 영어판이 나올 때까지 한국어 원문을 쓰고, 개발용 화면과 랭킹 픽스처는 사용자가 보지 않는다.
const I18N_EXEMPT = [
  "src/features/settings/legalDocuments.ts",
  "src/routes/WorkerParityPage.tsx",
  "src/routes/WebrtcLoopbackPage.tsx",
  "src/features/study-session/components/VisionPerfPanel.tsx",
  "src/features/study-session/components/DevVisionFailureNotice.tsx",
  "src/features/live-room/components/RoomDebugOverlay.tsx",
  "src/lib/rankingFixtures.ts",
  "src/lib/rankingMock.ts",
  // `?groupMock=`로 켜는 그룹 API 개발용 가짜 서버와 그 고정 데이터는 개발 빌드에서만 불러와 운영 사용자가 보지 않는다.
  "src/lib/groupRoomMock.ts",
  "src/lib/groupRoomMockData.ts",
  // 그룹 화면 모음(/dev/group-rooms)과 그 고정 데이터는 개발 빌드에서만 열려 사용자가 보지 않는다.
  "src/routes/DevGroupRoomsPage.tsx",
  "src/features/group-room/fixtures.ts",
  // 포인트 화면 모음(/dev/points)과 가짜 경계의 고정 데이터다. 상품 이름은 서버가 내려줄 값이라 카탈로그에 두지 않는다.
  "src/routes/DevPointsPage.tsx",
  "src/features/points/fixtures.ts",
];
const HANGUL_MESSAGE = "사용자 문구는 src/locales/ 카탈로그에 두고 t()로 읽는다";

export default [
  {
    ignores: [
      "dist",
      // MediaPipe wasm 런타임의 복사본(scripts/copyMediapipeWasm.js가 채운다). 생성물이고
      // Emscripten이 뱉은 미니파이 글루 JS라 검사하면 규칙 위반만 수천 건 나온다.
      // apps/mobile이 assets/web-dist를 같은 이유로 제외한다.
      "public/mediapipe/**",
      // 측정 도구의 빌드 산출물·인증서·결과(scripts/perf). 생성물이다.
      ".perf/**",
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
    // 측정 도구는 Node에서 돌지만 addInitScript·page.evaluate로 넘기는 함수는 브라우저에서 돈다.
    files: ["scripts/perf/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
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
  {
    files: I18N_ENFORCED,
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}", "src/test/**", ...I18N_EXEMPT],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "Literal[value=/[가-힣]/]", message: HANGUL_MESSAGE },
        { selector: "TemplateElement[value.raw=/[가-힣]/]", message: HANGUL_MESSAGE },
        { selector: "JSXText[value=/[가-힣]/]", message: HANGUL_MESSAGE },
      ],
    },
  },
];
