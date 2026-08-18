/**
 * `expo/metro-config`의 `getDefaultConfig` 대신 Sentry 래퍼를 쓴다 — 번들과 소스맵 양쪽에
 * **같은 debug ID**를 심어야 압축된 스택트레이스가 Sentry에서 원본으로 풀린다
 * (`apps/web`의 `sentryVitePlugin`과 같은 원리). 래퍼는 기본 설정을 그대로 확장하므로
 * NativeWind 등 나머지 구성에는 영향이 없다.
 *
 * ⚠️ `getDefaultConfig`로 되돌리지 말 것. 그래도 빌드는 성공하고 소스맵 업로드도 성공하는데
 * **스택트레이스만 압축된 채로 남는다** — 로그에 아무 신호가 없어 원인을 찾기 가장 어려운
 * 실패다(웹에서 2026-08-05에 같은 종류의 실패를 겪었다, `apps/web/CLAUDE.md`).
 */
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
