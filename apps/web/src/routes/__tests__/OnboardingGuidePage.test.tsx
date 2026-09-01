import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import {
  createMemoryOnboardingGuideStore,
  type OnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "@/features/onboarding/onboardingGuideStore";
import {
  GUIDE_CLOSE_LABEL,
  GUIDE_NEXT_LABEL,
  GUIDE_PREV_LABEL,
  GUIDE_SKIP_LABEL,
  GUIDE_START_LABEL,
} from "@/features/onboarding/onboardingGuideSteps";
import { OnboardingGuidePage } from "@/routes/OnboardingGuidePage";

/** 옛 세션 마감은 자기 테스트가 따로 있다 — 여기서는 통과시킨다. */
vi.mock("@/features/study-session/closeStaleSession", () => ({
  closeStaleSession: () => Promise.resolve(),
}));

// jsdom(26)에는 `PointerEvent` 구현이 없다 — testing-library가 `window.PointerEvent`를 못 찾으면
// 일반 `Event`로 폴백해 스와이프 판정에 쓰는 `clientX`/`clientY`가 사라진다(jsdom `MouseEvent`는
// 지원한다). 아래 스와이프 테스트에 좌표가 필요해 이 파일에서만 최소 폴리필을 둔다.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}

/**
 * (`apps/mobile/__tests__/onboarding-guide.test.tsx`에서 이식 — BY-334.
 * react-router 관례는 `routes/__tests__/settingsSubPages.test.tsx`를 따른다.)
 *
 * 카메라 권한 분기(G5 CTA → 권한 거부 시 S2-3 안내) 케이스는 이식하지 않는다 — 웹 플로우에
 * 권한 단계가 없기 때문이다(`focusStartFlow.test.ts`와 같은 판단). 색·숨김 상태의 세부 a11y
 * 단정(`includeHiddenElements` 등)도 RN 전용 테스트 API라 이식하지 않는다 — DOM
 * `getByText`는 `aria-hidden`과 무관하게 텍스트를 찾으므로 대응 개념이 없다.
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** 이동한 목적지의 경로+쿼리를 그대로 노출하는 스텁 — 실제 HomeTabPage/RoomPage는 카메라·
 *  네트워크 의존이 커서 여기서는 "어디로, 어떤 쿼리로 갔는가"만 가볍게 검증한다. */
function LocationProbe({ testId }: { testId: string }) {
  const location = useLocation();
  return <div data-testid={testId}>{location.pathname + location.search}</div>;
}

function renderGuideAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding-guide" element={<OnboardingGuidePage />} />
        <Route path="/home" element={<LocationProbe testId="home-stub" />} />
        <Route path="/room/:id" element={<LocationProbe testId="room-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/onboarding-guide — 단계 전환", () => {
  it("'다음'으로 G1→G5까지 이동하고 마지막 CTA만 '집중 시작하기'가 된다 (entry=focus-start)", () => {
    renderAt("/onboarding-guide?entry=focus-start");

    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    expect(screen.getByText("집중이 아니면, 잠시 멈춰요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    expect(screen.getByText("탭 한 번이면, 타이머만 떠요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    expect(screen.getByText("잠깐 쉴 땐 일시정지")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));

    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GUIDE_START_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: GUIDE_NEXT_LABEL })).not.toBeInTheDocument();
  });

  it("'이전'으로 되돌아간다", () => {
    renderAt("/onboarding-guide?entry=focus-start");

    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: GUIDE_PREV_LABEL }));

    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeInTheDocument();
  });

  it("오른쪽 절반 탭은 다음, 왼쪽 절반 탭은 이전 스텝으로 이동한다 (BY-343)", () => {
    // jsdom 기본 innerWidth 1024 — 좌/우 판정 기준은 그 절반(512)이다.
    renderAt("/onboarding-guide?entry=focus-start");
    const tapLayer = screen.getByTestId("onboarding-guide-tap-layer");

    fireEvent.pointerDown(tapLayer, { clientX: 800, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 800, clientY: 500 });
    expect(screen.getByText("집중이 아니면, 잠시 멈춰요")).toBeInTheDocument();

    fireEvent.pointerDown(tapLayer, { clientX: 200, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 200, clientY: 500 });
    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeInTheDocument();
  });

  it("G5(마지막 스텝)에서 오른쪽 탭·다음 방향 스와이프는 무동작이다 — 종료는 CTA로만 확정한다 (BY-343)", () => {
    renderAt("/onboarding-guide?entry=focus-start");
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    }
    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();
    const tapLayer = screen.getByTestId("onboarding-guide-tap-layer");

    // 오른쪽 탭 — 완료(세션 시작)로 이어지면 안 된다.
    fireEvent.pointerDown(tapLayer, { clientX: 800, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 800, clientY: 500 });
    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();

    // 다음 방향(좌로) 스와이프 — 같은 계약.
    fireEvent.pointerDown(tapLayer, { clientX: 500, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 500 - 60, clientY: 500 });
    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: GUIDE_START_LABEL })).toBeInTheDocument();

    // 왼쪽 탭(이전)은 여전히 동작한다.
    fireEvent.pointerDown(tapLayer, { clientX: 200, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 200, clientY: 500 });
    expect(screen.getByText("잠깐 쉴 땐 일시정지")).toBeInTheDocument();
  });

  it("G1(첫 스텝)에서 왼쪽 절반 탭은 무동작이다 — '이전'과 같은 계약", () => {
    renderAt("/onboarding-guide?entry=focus-start");
    const tapLayer = screen.getByTestId("onboarding-guide-tap-layer");

    fireEvent.pointerDown(tapLayer, { clientX: 200, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 200, clientY: 500 });

    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeInTheDocument();
  });

  it("좌로 스와이프하면 다음 스텝, 우로 스와이프하면 이전 스텝으로 이동한다", () => {
    renderAt("/onboarding-guide?entry=focus-start");
    const tapLayer = screen.getByTestId("onboarding-guide-tap-layer");

    fireEvent.pointerDown(tapLayer, { clientX: 300, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 300 - 60, clientY: 500 });
    expect(screen.getByText("집중이 아니면, 잠시 멈춰요")).toBeInTheDocument();

    fireEvent.pointerDown(tapLayer, { clientX: 240, clientY: 500 });
    fireEvent.pointerUp(tapLayer, { clientX: 240 + 60, clientY: 500 });
    expect(screen.getByText("순공시간이 여기에 쌓여요")).toBeInTheDocument();
  });

  it("entry=settings(재진입)에서는 마지막 CTA가 '가이드 종료하기'이고 건너뛰기가 없다", () => {
    renderAt("/onboarding-guide?entry=settings");

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    }

    expect(screen.queryByRole("button", { name: GUIDE_START_LABEL })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: GUIDE_CLOSE_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: GUIDE_SKIP_LABEL })).not.toBeInTheDocument();
  });
});

describe("/onboarding-guide — 종료 플로우(완료 플래그 저장 · 쿼리 승계)", () => {
  let store: OnboardingGuideStore;

  beforeEach(() => {
    store = createMemoryOnboardingGuideStore();
    setOnboardingGuideStore(store);
  });

  afterEach(() => {
    resetOnboardingGuideStore();
    // 아래 "뒤로 갈 히스토리가 있는" 테스트가 real window.history에 남긴 idx 상태를 지운다 —
    // closeGuide()가 window.history.state를 직접 읽으므로 남아 있으면 다음 테스트가 오염된다.
    window.history.replaceState(null, "", "/");
  });

  it("[회귀] 뒤로 갈 히스토리가 있어도(navigate(-1) 분기) G5 CTA는 홈이 아니라 세션으로 이동한다 — BY-334", async () => {
    // closeGuide()는 window.history.state.idx로 "뒤로 갈 스택이 있는지"를 판단한다
    // (react-router BrowserRouter가 실제로 채우는 값과 같은 모양). MemoryRouter는 이 값을
    // 안 건드리므로 직접 세팅해 "뒤로가기 분기"를 강제로 태운다.
    window.history.pushState({ idx: 0 }, "", "/home?userId=42");
    window.history.pushState({ idx: 1 }, "", "/onboarding-guide?entry=focus-start&userId=42");

    render(
      <MemoryRouter
        initialEntries={["/home?userId=42", "/onboarding-guide?entry=focus-start&userId=42"]}
        initialIndex={1}
      >
        <Routes>
          <Route path="/onboarding-guide" element={<OnboardingGuidePage />} />
          <Route path="/home" element={<LocationProbe testId="home-stub" />} />
          <Route path="/room/:id" element={<LocationProbe testId="room-stub" />} />
        </Routes>
      </MemoryRouter>,
    );

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    }
    fireEvent.click(screen.getByRole("button", { name: GUIDE_START_LABEL }));

    const roomStub = await screen.findByTestId("room-stub");
    expect(roomStub.textContent).toBe("/room/1?entry=focus-start&userId=42");
    expect(screen.queryByTestId("home-stub")).not.toBeInTheDocument();
  });

  it("G5 CTA(집중 시작하기)로 마지막 단계에서 시작하면 쿼리를 승계해 세션 라우트로 이동한다", async () => {
    renderGuideAt("/onboarding-guide?entry=focus-start&userId=42");

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    }
    fireEvent.click(screen.getByRole("button", { name: GUIDE_START_LABEL }));

    const roomStub = await screen.findByTestId("room-stub");
    expect(roomStub.textContent).toBe("/room/1?entry=focus-start&userId=42");
    await waitFor(async () => {
      await expect(store.hasSeenGuide()).resolves.toBe(true);
    });
  });

  it("건너뛰기를 눌러도 '봤다'로 기록하지만, 재진입 진입에서는 세션으로 이어지지 않는다", async () => {
    renderGuideAt("/onboarding-guide?entry=home-card&userId=42");

    fireEvent.click(screen.getByRole("button", { name: GUIDE_SKIP_LABEL }));

    const homeStub = await screen.findByTestId("home-stub");
    expect(homeStub.textContent).toBe("/home?entry=home-card&userId=42");
    expect(screen.queryByTestId("room-stub")).not.toBeInTheDocument();
    await waitFor(async () => {
      await expect(store.hasSeenGuide()).resolves.toBe(true);
    });
  });

  it("entry=settings에서 '가이드 종료하기'를 누르면 쿼리를 승계해 홈으로 돌아가고 세션을 시작하지 않는다", async () => {
    renderGuideAt("/onboarding-guide?entry=settings&userId=7");

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    }
    fireEvent.click(screen.getByRole("button", { name: GUIDE_CLOSE_LABEL }));

    const homeStub = await screen.findByTestId("home-stub");
    expect(homeStub.textContent).toBe("/home?entry=settings&userId=7");
    expect(screen.queryByTestId("room-stub")).not.toBeInTheDocument();
    await waitFor(async () => {
      await expect(store.hasSeenGuide()).resolves.toBe(true);
    });
  });

  it("우상단 X는 렌더되지 않는다 (2026-08-25 BY-427 피드백 — 종료는 건너뛰기·마지막 CTA로만)", () => {
    renderGuideAt("/onboarding-guide?entry=focus-start&userId=42");

    expect(screen.queryByRole("button", { name: "가이드 닫기" })).not.toBeInTheDocument();
  });
});

describe("/onboarding-guide — 네이티브 백 제스처 잠금 (BY-343)", () => {
  beforeEach(() => {
    setOnboardingGuideStore(createMemoryOnboardingGuideStore());
  });

  afterEach(() => {
    resetOnboardingGuideStore();
    vi.unstubAllGlobals();
  });

  it("마운트에서 제스처를 끄고 언마운트에서 되켠다 — 가장자리 스와이프의 가이드 통째 이탈 방지", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    const { unmount } = renderGuideAt("/onboarding-guide?entry=settings");

    const sent = () =>
      postMessage.mock.calls
        .map(([raw]) => JSON.parse(raw as string) as { type: string; enabled?: boolean })
        .filter((message) => message.type === "set-back-gesture");
    expect(sent()).toEqual([expect.objectContaining({ enabled: false })]);

    unmount();

    expect(sent()).toEqual([
      expect.objectContaining({ enabled: false }),
      expect.objectContaining({ enabled: true }),
    ]);
  });
});
