import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type * as ReactRouterDom from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryOnboardingGuideStore,
  type OnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "@/features/onboarding/onboardingGuideStore";
import {
  GUIDE_NEXT_LABEL,
  GUIDE_SKIP_LABEL,
  GUIDE_START_LABEL,
} from "@/features/onboarding/onboardingGuideSteps";
import { OnboardingGuidePage } from "@/routes/OnboardingGuidePage";

/**
 * BY-334 회귀 — `handleFinish`는 종료 한 번에 히스토리 조작도 정확히 한 번이어야 한다.
 *
 * 실제 버그는 브라우저의 **비동기** `history.go(-1)`(popstate가 다음 태스크에 발화)과
 * `continueAfterOnboardingGuide`의 `await`(마이크로태스크)가 경합해 push가 먼저 실행되고
 * 뒤늦은 pop이 그걸 되돌리는 것이다. `OnboardingGuidePage.test.tsx`에 최종 목적지를 단정하는
 * 회귀 테스트를 추가했지만, jsdom/MemoryRouter의 `navigate(-1)`은 **동기**라 그 경합을
 * 재현하지 못한다(수정 전 코드로 실행해도 통과함 — 확인 완료). 그래서 이 파일은 `navigate()`
 * 호출 자체를 스파이로 잡아 "정확히 한 번" 불변식을 직접 검증한다.
 *
 * `useNavigate`만 스텁으로 바꿔야 해서 이 파일에서만 `react-router-dom`을 모킹한다 — 다른
 * 테스트 파일(`OnboardingGuidePage.test.tsx`)까지 같이 모킹되면 실제 라우팅으로 목적지를
 * 확인하는 테스트들이 깨진다.
 */
const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

function renderGuideAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding-guide" element={<OnboardingGuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function clickToLastStep() {
  for (let i = 0; i < 4; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
  }
}

describe("/onboarding-guide — navigate() 호출 횟수(BY-334 회귀)", () => {
  let store: OnboardingGuideStore;

  beforeEach(() => {
    store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);
    navigateSpy.mockClear();
  });

  afterEach(() => {
    resetOnboardingGuideStore();
    window.history.replaceState(null, "", "/");
  });

  it("entry=focus-start · 뒤로 갈 히스토리 없음: G5 CTA는 /room/1로 정확히 한 번만 replace 이동한다", async () => {
    renderGuideAt("/onboarding-guide?entry=focus-start&userId=42");
    clickToLastStep();

    fireEvent.click(screen.getByRole("button", { name: GUIDE_START_LABEL }));

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
    expect(navigateSpy).toHaveBeenCalledWith(
      { pathname: "/room/1", search: "?entry=focus-start&userId=42" },
      { replace: true },
    );
  });

  it("entry=focus-start · 뒤로 갈 히스토리 있음(navigate(-1) 분기 대상): 그래도 /room/1 한 번만 이동한다", async () => {
    // closeGuide()가 여길 봤다면 navigate(-1)도 함께 호출됐을 것 — 고친 코드는 focus-start에서
    // closeGuide() 자체를 호출하지 않으므로 이 idx 유무와 무관하게 항상 1번이어야 한다.
    window.history.pushState({ idx: 1 }, "", "/onboarding-guide?entry=focus-start&userId=42");

    renderGuideAt("/onboarding-guide?entry=focus-start&userId=42");
    clickToLastStep();

    fireEvent.click(screen.getByRole("button", { name: GUIDE_START_LABEL }));

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
    expect(navigateSpy).toHaveBeenCalledWith(
      { pathname: "/room/1", search: "?entry=focus-start&userId=42" },
      { replace: true },
    );
  });

  it("entry=home-card(재진입) · 건너뛰기: closeGuide() 한 번만 호출되고 세션 이동은 없다", async () => {
    renderGuideAt("/onboarding-guide?entry=home-card&userId=42");

    fireEvent.click(screen.getByRole("button", { name: GUIDE_SKIP_LABEL }));

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
    expect(navigateSpy).toHaveBeenCalledWith(
      { pathname: "/home", search: "?entry=home-card&userId=42" },
      { replace: true },
    );
  });
});

/**
 * 네이티브 웹뷰(브리지 있음) 재리뷰 회귀 — `f6e58dc`가 `entry==="focus-start"`일 때
 * `closeGuide()`를 아예 안 부르게 바꾸면서, 브리지가 있는 환경(`requestSessionStart`가
 * `navigateToSession` 콜백을 부르지 않는 경로 — BY-333 미구현이라 네이티브 응답도 없음)에서는
 * 화면이 가이드에 멈추고 `hasClosedRef` 래치 때문에 X도 no-op이 되는 회귀가 생겼다.
 *
 * `requestSessionStart`가 이제 `"native" | "web"`을 반환하므로, `"native"`일 때만
 * `handleFinish`가 `closeGuide()`를 호출한다 — `navigateToSession`이 전혀 불리지 않는 경로라
 * `closeGuide()`가 여전히 유일한 히스토리 조작이다.
 */
describe("/onboarding-guide — 네이티브 웹뷰(브리지 있음)", () => {
  let store: OnboardingGuideStore;
  const globalWithBridge = globalThis as {
    ReactNativeWebView?: { postMessage(m: string): void };
  };

  beforeEach(() => {
    store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);
    navigateSpy.mockClear();
  });

  afterEach(() => {
    resetOnboardingGuideStore();
    window.history.replaceState(null, "", "/");
    delete globalWithBridge.ReactNativeWebView;
  });

  /** 발신된 브리지 메시지 type 목록 — 가이드 마운트가 보내는 set-back-gesture(BY-343)와
   *  세션 시작(start-session)을 구분해 세기 위해 인덱스 대신 type으로 본다. */
  const sentTypes = (postMessage: ReturnType<typeof vi.fn>) =>
    postMessage.mock.calls.map(([raw]) => (JSON.parse(raw as string) as { type: string }).type);

  it("entry=focus-start · G5 완료: start-session을 보내고 가이드가 정확히 한 번 닫힌다(갇히지 않음)", async () => {
    const postMessage = vi.fn();
    globalWithBridge.ReactNativeWebView = { postMessage };

    renderGuideAt("/onboarding-guide?entry=focus-start&userId=42");
    clickToLastStep();

    fireEvent.click(screen.getByRole("button", { name: GUIDE_START_LABEL }));

    await vi.waitFor(() => {
      expect(sentTypes(postMessage)).toContain("start-session");
    });
    expect(sentTypes(postMessage).filter((type) => type === "start-session")).toHaveLength(1);

    // 뒤로 갈 히스토리가 없으므로 closeGuide()는 /home으로 replace 이동한다 — 정확히 한 번.
    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
    expect(navigateSpy).toHaveBeenCalledWith(
      { pathname: "/home", search: "?entry=focus-start&userId=42" },
      { replace: true },
    );
  });

  it("entry=focus-start · 뒤로 갈 히스토리 있음: G5 완료가 start-session 발신 + navigate(-1) 한 번으로 닫는다", async () => {
    const postMessage = vi.fn();
    globalWithBridge.ReactNativeWebView = { postMessage };
    window.history.pushState({ idx: 1 }, "", "/onboarding-guide?entry=focus-start&userId=42");

    renderGuideAt("/onboarding-guide?entry=focus-start&userId=42");
    clickToLastStep();

    fireEvent.click(screen.getByRole("button", { name: GUIDE_START_LABEL }));

    await vi.waitFor(() => {
      expect(sentTypes(postMessage)).toContain("start-session");
    });
    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it("브리지가 있어도 건너뛰기 종료는 정상 동작한다 — 래치가 갇힘을 만들지 않는다", async () => {
    globalWithBridge.ReactNativeWebView = { postMessage: vi.fn() };

    renderGuideAt("/onboarding-guide?entry=home-card&userId=42");

    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
    expect(navigateSpy).toHaveBeenCalledWith(
      { pathname: "/home", search: "?entry=home-card&userId=42" },
      { replace: true },
    );
  });
});
