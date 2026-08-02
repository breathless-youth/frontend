import { describe, expect, it } from "vitest";

import { isForwardEntryIntoFullScreen } from "../historyGuard";

/**
 * 판정 순수 함수만 검증한다 — 훅의 idx 추적은 `window.history`(BrowserRouter) 전제라
 * MemoryRouter 기반 라우트 테스트로는 포워드 제스처를 재현할 수 없다(브라우저 뒤/앞 이동이
 * jsdom에 없다). 실기기 확인은 BY-343 검증 절차를 따른다.
 */
describe("isForwardEntryIntoFullScreen", () => {
  it("POP + idx 증가 + 전체 화면 라우트 = 포워드 제스처 되열림 → 막는다", () => {
    expect(isForwardEntryIntoFullScreen("POP", 0, 1, "/terms")).toBe(true);
    expect(isForwardEntryIntoFullScreen("POP", 0, 1, "/onboarding-guide")).toBe(true);
  });

  it("의도된 진입(PUSH)은 막지 않는다", () => {
    expect(isForwardEntryIntoFullScreen("PUSH", 0, 1, "/terms")).toBe(false);
  });

  it("뒤로 가기(idx 감소)는 막지 않는다 — 전체 화면 라우트로 되돌아가는 경우 포함", () => {
    expect(isForwardEntryIntoFullScreen("POP", 2, 1, "/terms")).toBe(false);
    expect(isForwardEntryIntoFullScreen("POP", 1, 0, "/settings")).toBe(false);
  });

  it("전체 화면 라우트가 아니면 포워드여도 막지 않는다 — 탭 루트 간 이동은 이 가드의 몫이 아니다", () => {
    expect(isForwardEntryIntoFullScreen("POP", 0, 1, "/home")).toBe(false);
  });

  it("REPLACE는 막지 않는다 — 가이드 종료 폴백(replace 이동)이 걸리면 안 된다", () => {
    expect(isForwardEntryIntoFullScreen("REPLACE", 0, 1, "/terms")).toBe(false);
  });
});
