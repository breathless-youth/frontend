import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  continueAfterOnboardingGuide,
  exitOnboardingGuide,
  runFocusStartFlow,
} from "../focusStartFlow";
import {
  createMemoryOnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "../onboardingGuideStore";

/**
 * (모바일판 `lib/__tests__/focusStartFlow.test.ts`에서 이식 — BY-334.)
 *
 * 권한 게이트 분기 케이스는 이식하지 않는다 — 웹 플로우에 권한 단계가 없기 때문이다.
 * 카메라 권한 요청과 거부 안내(S2-3)는 네이티브 소유이고, 웹은 `startSession`(=`start-session`
 * 브리지 발신)까지만 책임진다(ADR-0003). 대신 **"세션 시작을 요청했는가"** 자체를 검증한다.
 */

function makeNavigator() {
  return {
    openOnboardingGuide: vi.fn(),
    startSession: vi.fn(),
  };
}

beforeEach(() => {
  setOnboardingGuideStore(createMemoryOnboardingGuideStore());
});

afterEach(() => {
  resetOnboardingGuideStore();
});

describe("runFocusStartFlow — S1 '집중 시작' 탭", () => {
  it("최초 1회는 가이드를 먼저 띄우고 세션을 시작하지 않는다", async () => {
    const nav = makeNavigator();

    await runFocusStartFlow(nav);

    expect(nav.openOnboardingGuide).toHaveBeenCalledWith("focus-start");
    expect(nav.startSession).not.toHaveBeenCalled();
  });

  it("가이드를 이미 봤으면 가이드를 건너뛰고 곧장 세션 시작을 요청한다", async () => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));
    const nav = makeNavigator();

    await runFocusStartFlow(nav);

    expect(nav.openOnboardingGuide).not.toHaveBeenCalled();
    expect(nav.startSession).toHaveBeenCalledTimes(1);
  });

  it("저장소 조회가 실패하면 가이드를 띄운다 (fail-safe — 세션이 막히지 않는다)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setOnboardingGuideStore({
      hasSeenGuide: () => Promise.reject(new Error("저장소 없음")),
      markGuideSeen: () => Promise.resolve(),
    });
    const nav = makeNavigator();

    await runFocusStartFlow(nav);

    expect(nav.openOnboardingGuide).toHaveBeenCalledWith("focus-start");
    warn.mockRestore();
  });
});

describe("continueAfterOnboardingGuide — 가이드 종료 후", () => {
  it("'집중 시작' 진입이면 세션 시작으로 이어진다 (2026-07-26 확정 플로우)", async () => {
    const nav = makeNavigator();

    await continueAfterOnboardingGuide(nav, "focus-start");

    expect(nav.startSession).toHaveBeenCalledTimes(1);
  });

  it("완료든 건너뛰기든 '봤다'로 기록해 다음 '집중 시작'에서 다시 뜨지 않는다", async () => {
    const store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);

    await continueAfterOnboardingGuide(makeNavigator(), "focus-start");

    await expect(store.hasSeenGuide()).resolves.toBe(true);
    const nav = makeNavigator();
    await runFocusStartFlow(nav);
    expect(nav.openOnboardingGuide).not.toHaveBeenCalled();
  });

  it("다시 보기(홈 카드·설정) 진입에서는 세션을 시작하지 않는다 — 2026-07-28 확정(BY-151)", async () => {
    for (const entry of ["home-card", "settings"] as const) {
      const nav = makeNavigator();
      await continueAfterOnboardingGuide(nav, entry);

      expect(nav.startSession).not.toHaveBeenCalled();
    }
  });

  it("다시 보기 진입에서도 '봤음'은 기록한다 (멱등 — 단일 규칙)", async () => {
    const store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);

    await continueAfterOnboardingGuide(makeNavigator(), "settings");

    await expect(store.hasSeenGuide()).resolves.toBe(true);
  });
});

describe("exitOnboardingGuide — 우상단 X 나가기(BY-151)", () => {
  it("봤음을 저장하고 세션은 시작하지 않는다", async () => {
    const store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);
    const nav = makeNavigator();

    await exitOnboardingGuide();

    await expect(store.hasSeenGuide()).resolves.toBe(true);
    expect(nav.startSession).not.toHaveBeenCalled();
  });
});
