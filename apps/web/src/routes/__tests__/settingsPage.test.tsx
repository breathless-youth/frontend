import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as InterviewForm from "@/features/interview/interviewForm";
import type * as Amplitude from "@/lib/amplitude";
import type * as LazyRoutes from "@/routes/lazyRoutes";

import { App } from "@/App";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { hardNavigate } from "@/lib/hardNavigation";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/features/settings/legalDocuments";
import { SettingsPage } from "@/routes/SettingsPage";
import { resetViewTransitionStub, stubViewTransition } from "@/test/viewTransitionStub";

// jsdom은 실제 내비게이션을 구현하지 않아 `window.location.assign`을 직접 검증할 수 없다 —
// 하드 내비게이션은 이 모듈 단위로 모킹한다(`lib/hardNavigation.ts` 주석).
vi.mock("@/lib/hardNavigation", () => ({
  hardNavigate: vi.fn(),
  hardReplace: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackOsSettingsOpened: vi.fn(),
  trackSettingsRowPressed: vi.fn(),
  trackInterviewClicked: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackOsSettingsOpened: analytics.trackOsSettingsOpened,
  trackSettingsRowPressed: analytics.trackSettingsRowPressed,
  trackInterviewClicked: analytics.trackInterviewClicked,
}));

const getInterviewStatus = vi.hoisted(() => vi.fn());
vi.mock("@/lib/interviewApi", () => ({ getInterviewStatus }));

const openInterviewForm = vi.hoisted(() => vi.fn());
vi.mock("@/features/interview/interviewForm", async (importOriginal) => ({
  ...(await importOriginal<typeof InterviewForm>()),
  openInterviewForm,
}));

const prefetchSettingsSubPages = vi.hoisted(() => vi.fn());

vi.mock("@/routes/lazyRoutes", async (importOriginal) => ({
  ...(await importOriginal<typeof LazyRoutes>()),
  prefetchSettingsSubPages,
}));

/**
 * S6 · 설정 화면 웹 이식 테스트 — RN 원본 `apps/mobile/__tests__/settings.test.tsx`를
 * 웹 상황(카메라 권한 상태 조회 없음, appVersion 쿼리)에 맞게 이식한다.
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** 이동한 목적지의 경로+쿼리를 그대로 노출하는 스텁(`OnboardingGuidePage.test.tsx`와 같은 패턴). */
function LocationProbe({ testId }: { testId: string }) {
  const location = useLocation();
  return <div data-testid={testId}>{location.pathname + location.search}</div>;
}

/** App은 자체 QueryClientProvider를 갖지만 SettingsPage를 단독으로 그릴 때는 직접 감싸야 한다. */
function withQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

function renderSettingsWithGuideStub(path: string) {
  return render(
    withQueryClient(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/onboarding-guide"
            element={<LocationProbe testId="onboarding-guide-stub" />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  getInterviewStatus.mockResolvedValue({
    cardEligible: false,
    cardUrl: null,
    settingsEnabled: false,
    settingsUrl: null,
  });
});

afterEach(() => {
  resetViewTransitionStub();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // 모듈 모킹된 hardNavigation 호출 기록이 테스트 간 새지 않게 한다.
  vi.clearAllMocks();
  // sonner 토스트 상태는 모듈 전역이라 화면 언마운트와 무관하게 다음 테스트로 샌다.
  act(() => {
    toast.dismiss();
  });
});

/** 네이티브가 `injectJavaScript`로 호출하는 전역을 테스트에서 대신 부른다. */
function pushCameraPermission(granted: boolean) {
  const receive = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  act(() => {
    receive(JSON.stringify({ type: "camera-permission", granted, atMs: 1 }));
  });
}

describe("S6 · 설정", () => {
  it("화면이 뜨면 하위 화면 청크를 미리 받는다", () => {
    renderSettingsWithGuideStub("/settings");

    expect(prefetchSettingsSubPages).toHaveBeenCalled();
  });

  it("2개 그룹 6개 행을 확정 문구 그대로 보여준다", () => {
    renderAt("/settings");

    expect(screen.getByText("설정")).toBeInTheDocument();

    // BY-409: 프로필 섹션 — 설정이 프로필 수정(S7-18)의 유일한 진입점이다.
    expect(screen.getByText("프로필")).toBeInTheDocument();
    expect(screen.getByText("프로필 수정")).toBeInTheDocument();

    expect(screen.getByText("서비스")).toBeInTheDocument();
    expect(screen.getByText("카메라 권한")).toBeInTheDocument();
    expect(screen.getByText("서비스 이용 가이드")).toBeInTheDocument();

    expect(screen.getByText("지원")).toBeInTheDocument();
    expect(screen.getByText("문의하기")).toBeInTheDocument();

    expect(screen.getByText("약관 · 정보")).toBeInTheDocument();
    expect(screen.getByText("이용약관")).toBeInTheDocument();
    expect(screen.getByText("개인정보처리방침")).toBeInTheDocument();
  });

  it("프로필 수정 행은 기존 쿼리(userId·appVersion)를 승계해 /profile 로 이동한다 (BY-409)", () => {
    render(
      withQueryClient(
        <MemoryRouter initialEntries={["/settings?userId=7&appVersion=1.4.2"]}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<LocationProbe testId="profile-stub" />} />
          </Routes>
        </MemoryRouter>,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "프로필 수정" }));

    expect(screen.getByTestId("profile-stub").textContent).toBe(
      "/profile?userId=7&appVersion=1.4.2",
    );
  });

  it("서비스 이용 가이드 행은 버튼으로 노출되고 클릭 시 온보딩 가이드로 이동한다 (entry=settings, BY-334)", () => {
    renderSettingsWithGuideStub("/settings");

    fireEvent.click(screen.getByRole("button", { name: "서비스 이용 가이드" }));

    expect(screen.getByTestId("onboarding-guide-stub").textContent).toBe(
      "/onboarding-guide?entry=settings",
    );
  });

  it("서비스 이용 가이드는 기존 쿼리(userId·appVersion)를 잃지 않고 entry만 얹어 승계한다 (리뷰 반영)", () => {
    renderSettingsWithGuideStub("/settings?userId=7&appVersion=1.4.2");

    fireEvent.click(screen.getByRole("button", { name: "서비스 이용 가이드" }));

    expect(screen.getByTestId("onboarding-guide-stub").textContent).toBe(
      "/onboarding-guide?userId=7&appVersion=1.4.2&entry=settings",
    );
  });

  it("문의하기 행은 /contact 를 문서 단위(하드) 내비게이션으로 연다 — SPA로 가면 설정 문서의 COEP를 승계해 구글 폼 iframe이 차단된다", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "문의하기" }));

    expect(hardNavigate).toHaveBeenCalledWith("/contact");
  });

  it("문의하기도 기존 쿼리(userId·appVersion)를 잃지 않고 승계한다 — 딥링크 폴백이 쿼리를 되돌려줘야 한다", () => {
    renderAt("/settings?userId=7&appVersion=1.4.2");

    fireEvent.click(screen.getByRole("button", { name: "문의하기" }));

    expect(hardNavigate).toHaveBeenCalledWith("/contact?userId=7&appVersion=1.4.2");
  });

  it("이용약관 행은 /terms 로 이동한다", async () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "이용약관" }));

    expect(
      await screen.findByRole("heading", { name: TERMS_OF_SERVICE.title }),
    ).toBeInTheDocument();
  });

  it("개인정보처리방침 행은 /privacy 로 이동한다", async () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "개인정보처리방침" }));

    expect(await screen.findByRole("heading", { name: PRIVACY_POLICY.title })).toBeInTheDocument();
  });

  it("오픈소스 라이선스 행은 /licenses 로 이동한다 (BY-310)", async () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "오픈소스 라이선스" }));

    expect(
      await screen.findByRole("heading", { name: "Open Source Licenses" }),
    ).toBeInTheDocument();
  });

  it("appVersion 쿼리와 웹 버전을 함께 버전 정보 행에 반영한다", () => {
    renderAt("/settings?appVersion=1.4.2");

    // jsdom UA는 android도 ios도 아니라 플랫폼이 null이고 앱 버전도 구형식이라 나란히 적힌다.
    expect(screen.getByText(`1.4.2 / ${__WEB_VERSION__}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "버전 정보" })).not.toBeInTheDocument();
  });

  it("appVersion 쿼리가 없으면 웹 버전만 표시한다", () => {
    renderAt("/settings");

    expect(screen.getByText(__WEB_VERSION__)).toBeInTheDocument();
  });

  it("카메라 권한 행에 시안의 안내 툴팁 버튼(ⓘ)이 있다", () => {
    renderAt("/settings");

    expect(screen.getByRole("button", { name: "카메라 권한 안내" })).toBeInTheDocument();
  });

  it("카메라 권한 라벨은 글자이고, 토글을 감싼 버튼이 시스템 설정을 연다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    renderAt("/settings");

    pushCameraPermission(true);

    const toggle = screen.getByRole("button", { name: "카메라 권한, 허용됨, 시스템 설정 열기" });
    expect(within(toggle).queryByText("카메라 권한")).not.toBeInTheDocument();
    expect(screen.getByText("카메라 권한")).toBeInTheDocument();
  });

  it("카메라 권한 토글을 누르면 open-settings 메시지를 네이티브로 보낸다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));

    renderAt("/settings");
    pushCameraPermission(false);
    fireEvent.click(
      screen.getByRole("button", { name: "카메라 권한, 허용 안 됨, 시스템 설정 열기" }),
    );

    expect(postMessage).toHaveBeenCalledWith('{"type":"open-settings","atMs":1000}');
    // 설정 탭에서 OS 설정을 연 횟수(BY-616 확장) — 권한 회복 퍼널의 중간 단계.
    expect(analytics.trackOsSettingsOpened).toHaveBeenCalledWith("settings_tab");
  });

  describe("카메라 권한 토글", () => {
    it("마운트되면 네이티브에 권한 상태를 물어본다", () => {
      const postMessage = vi.fn();
      vi.stubGlobal("ReactNativeWebView", { postMessage });

      renderAt("/settings");

      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"type":"request-camera-permission"'),
      );
    });

    it("답을 받기 전에는 토글도, 시스템 설정을 여는 버튼도 없다", () => {
      vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

      renderAt("/settings");

      expect(screen.queryByRole("button", { name: /시스템 설정 열기/ })).not.toBeInTheDocument();
    });

    it("granted를 받으면 토글과 함께 허용됨으로 읽어준다", () => {
      vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
      renderAt("/settings");

      pushCameraPermission(true);

      expect(
        screen.getByRole("button", { name: "카메라 권한, 허용됨, 시스템 설정 열기" }),
      ).toBeInTheDocument();
    });

    it("허용 안 됨도 같은 자리에 반영된다", () => {
      vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
      renderAt("/settings");

      pushCameraPermission(false);

      expect(
        screen.getByRole("button", { name: "카메라 권한, 허용 안 됨, 시스템 설정 열기" }),
      ).toBeInTheDocument();
    });

    it("OS 설정에 다녀와 웹뷰가 다시 보이면 상태를 다시 묻는다", () => {
      const postMessage = vi.fn();
      vi.stubGlobal("ReactNativeWebView", { postMessage });
      renderAt("/settings");
      const beforeReturn = postMessage.mock.calls.length;

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // jsdom의 기본 visibilityState는 "visible"이라 재조회 경로가 그대로 탄다.
      expect(postMessage.mock.calls.length).toBeGreaterThan(beforeReturn);
    });

    it("브라우저 단독 모드에서는 묻지도 않고, 누를 버튼도 없다", () => {
      renderAt("/settings");

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(screen.queryByRole("button", { name: /시스템 설정 열기/ })).not.toBeInTheDocument();
    });
  });

  it("프로필 수정 행은 오른쪽에서 들어오는 전환으로 이동한다", async () => {
    const { start, updateDone } = stubViewTransition();
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: /프로필 수정/ }));

    expect(start).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.pageTransition).toBe("forward");
    await act(async () => {
      await updateDone();
    });
    expect(screen.getByRole("heading", { name: "프로필 수정" })).toBeInTheDocument();
  });

  it("하위 화면의 뒤로 가기 버튼은 반대 방향 전환으로 돌아온다", async () => {
    const { updateDone } = stubViewTransition();
    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: /이용약관/ }));
    await act(async () => {
      await updateDone();
    });

    const back = stubViewTransition();
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(document.documentElement.dataset.pageTransition).toBe("back");
    await act(async () => {
      await back.updateDone();
    });
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });
});

describe("설정 행 계측 (BY-616 확장 2차)", () => {
  it.each([
    ["이용약관", "terms"],
    ["개인정보처리방침", "privacy"],
    ["오픈소스 라이선스", "licenses"],
    ["프로필 수정", "profile"],
  ])("%s 행 터치를 row=%s로 남긴다", (label, row) => {
    analytics.trackSettingsRowPressed.mockClear();
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));

    expect(analytics.trackSettingsRowPressed).toHaveBeenCalledWith(row);
  });
});

describe("버전 정보 복사", () => {
  // Object.assign 으로 넣은 clipboard 는 전역 afterEach 의 unstubAllGlobals 로 복원되지 않아
  // 다음 파일로 샌다. 원래 값을 저장해 직접 되돌린다(jsdom 기본엔 clipboard 가 없다).
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, "clipboard", original);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  function setClipboard(writeText: () => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  }

  it("복사 성공 시 버전을 클립보드에 넣고 성공 토스트를 띄운다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: `${__WEB_VERSION__} 복사` }));

    expect(writeText).toHaveBeenCalledWith(__WEB_VERSION__);
    expect(await screen.findByText("버전을 복사했어요")).toBeInTheDocument();
  });

  it("복사가 거부되면 실패 토스트를 띄운다", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));

    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: `${__WEB_VERSION__} 복사` }));

    expect(await screen.findByText("복사하지 못했어요")).toBeInTheDocument();
  });

  it("클립보드 API가 없는 환경에서는 실패 토스트를 띄운다", async () => {
    Reflect.deleteProperty(navigator, "clipboard");

    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: `${__WEB_VERSION__} 복사` }));

    expect(await screen.findByText("복사하지 못했어요")).toBeInTheDocument();
  });
});

describe("인터뷰 신청하기 행", () => {
  const FORM = "https://docs.google.com/forms/d/e/a/viewform?entry.1=NICKNAME";

  it("서버가 켜면 문의하기 아래에 배지와 함께 보인다", async () => {
    getInterviewStatus.mockResolvedValue({
      cardEligible: false,
      cardUrl: null,
      settingsEnabled: true,
      settingsUrl: FORM,
    });
    renderSettingsWithGuideStub("/settings?userId=7");

    const row = await screen.findByRole("button", { name: "인터뷰 신청하기, 기프티콘 증정" });
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(buttons.indexOf("문의하기")).toBe(
      buttons.indexOf(row.getAttribute("aria-label") ?? "") - 1,
    );
  });

  it("서버가 끄면 보이지 않는다", async () => {
    renderSettingsWithGuideStub("/settings?userId=7");

    await waitFor(() => expect(getInterviewStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /인터뷰 신청하기/ })).toBeNull();
  });

  it("누르면 신청으로 남기고 폼을 연다", async () => {
    getInterviewStatus.mockResolvedValue({
      cardEligible: false,
      cardUrl: null,
      settingsEnabled: true,
      settingsUrl: FORM,
    });
    renderSettingsWithGuideStub("/settings?userId=7");

    fireEvent.click(await screen.findByRole("button", { name: "인터뷰 신청하기, 기프티콘 증정" }));

    expect(JSON.parse(localStorage.getItem("focuson.interview.v1")!).applied).toBe(true);
    expect(openInterviewForm).toHaveBeenCalledWith(FORM, "?userId=7");
    expect(analytics.trackSettingsRowPressed).toHaveBeenCalledWith("interview");
    expect(analytics.trackInterviewClicked).toHaveBeenCalledWith({ source: "settings" });
  });

  it("다시 받다가 실패하면 예전 값이 남아 있어도 숨기고 한 번 경고한다", async () => {
    getInterviewStatus.mockResolvedValue({
      cardEligible: false,
      cardUrl: null,
      settingsEnabled: true,
      settingsUrl: FORM,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/settings?userId=7"]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "인터뷰 신청하기, 기프티콘 증정" });

    getInterviewStatus.mockRejectedValue(new Error("network"));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["interview"] });
    });

    expect(getInterviewStatus).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /인터뷰 신청하기/ })).toBeNull(),
    );
    expect(warn.mock.calls.filter(([m]) => String(m).startsWith("[interview]"))).toHaveLength(1);
    warn.mockRestore();
  });
});
