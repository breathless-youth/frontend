import { describe, expect, it } from "vitest";

import { API_ENDPOINTS, apiVersionFor, type ApiEndpoint } from "@focusmakers/types";

/**
 * 백엔드가 준 엔드포인트별 버전 표(2026-09-22 개발 API 실측)를 그대로 옮긴 것.
 * 레지스트리 값을 여기 표와 대조해, 새 엔드포인트를 더하거나 기존 값을 잘못 고치면
 * 이 테스트가 깨지게 한다 — 오기입은 400을 내 사용자에게 닿기 전에 여기서 잡는다.
 *
 * `current`는 토큰 출처가 있는 신 앱 문서가 보내는 값, `legacy`는 토큰 출처가 없는
 * 구 앱 문서가 보내는 값(구 계약이 없으면 current와 같다).
 */
const EXPECTED: Record<ApiEndpoint, { current: string; legacy: string }> = {
  register: { current: "2", legacy: "2" },
  refresh: { current: "1", legacy: "1" },
  profile: { current: "2", legacy: "1" },
  stats: { current: "2", legacy: "1" },
  statsStreak: { current: "2", legacy: "1" },
  statsPeriod: { current: "2", legacy: "1" },
  studyDays: { current: "1", legacy: "1" },
  studySessionSubmit: { current: "2", legacy: "1" },
  studySessionDetail: { current: "2", legacy: "1" },
  activeSessionReport: { current: "2", legacy: "1" },
  activeSessionRestore: { current: "2", legacy: "1" },
  sessionRecovery: { current: "2", legacy: "1" },
  roomCreate: { current: "2", legacy: "1" },
  roomJoin: { current: "2", legacy: "1" },
  roomLeave: { current: "2", legacy: "1" },
  rtcStats: { current: "2", legacy: "1" },
};

describe("apiVersionFor", () => {
  const keys = Object.keys(API_ENDPOINTS) as ApiEndpoint[];

  it.each(keys)("%s는 표와 같은 버전을 돌려준다", (endpoint) => {
    expect(apiVersionFor(endpoint, false)).toBe(EXPECTED[endpoint].current);
    expect(apiVersionFor(endpoint, true)).toBe(EXPECTED[endpoint].legacy);
  });

  it("표와 레지스트리의 엔드포인트 집합이 정확히 일치한다 — 한쪽에만 있으면 깨진다", () => {
    expect(keys.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("구 계약이 없는 새 경로는 legacy도 current와 같다", () => {
    // 이 두 경로는 구 앱이 부른 적이 없어 계약이 하나뿐이다. legacy 문서가 불러도 v1이다.
    expect(apiVersionFor("refresh", true)).toBe(apiVersionFor("refresh", false));
    expect(apiVersionFor("studyDays", true)).toBe(apiVersionFor("studyDays", false));
  });
});
