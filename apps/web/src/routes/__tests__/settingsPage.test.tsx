import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { App } from "@/App";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { hardNavigate } from "@/lib/hardNavigation";
import { markProfileSaved } from "@/features/profile/profileSavedNotice";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/features/settings/legalDocuments";
import { SettingsPage } from "@/routes/SettingsPage";

// jsdom은 실제 내비게이션을 구현하지 않아 `window.location.assign`을 직접 검증할 수 없다 —
// 하드 내비게이션은 이 모듈 단위로 모킹한다(`lib/hardNavigation.ts` 주석).
vi.mock("@/lib/hardNavigation", () => ({
  hardNavigate: vi.fn(),
  hardReplace: vi.fn(),
}));

const analytics = vi.hoisted(() => ({ trackOsSettingsOpened: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackOsSettingsOpened: analytics.trackOsSettingsOpened,
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

function renderSettingsWithGuideStub(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/onboarding-guide"
          element={<LocationProbe testId="onboarding-guide-stub" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // 모듈 모킹된 hardNavigation 호출 기록이 테스트 간 새지 않게 한다.
  vi.clearAllMocks();
});

describe("S6 · 설정", () => {
  it("2개 그룹 6개 행을 확정 문구 그대로 보여준다", () => {
    renderAt("/settings");

    expect(screen.getByText("설정")).toBeInTheDocument();

    // BY-409: 프로필 섹션 — 설정이 프로필 설정(S7-18)의 유일한 진입점이다.
    expect(screen.getByText("프로필")).toBeInTheDocument();
    expect(screen.getByText("프로필 설정")).toBeInTheDocument();

    expect(screen.getByText("측정")).toBeInTheDocument();
    expect(screen.getByText("카메라 권한")).toBeInTheDocument();
    expect(screen.getByText("측정 기준 안내")).toBeInTheDocument();
    expect(screen.getByText("권한은 시스템 설정에서 바꿀 수 있어요")).toBeInTheDocument();

    expect(screen.getByText("지원")).toBeInTheDocument();
    expect(screen.getByText("문의하기")).toBeInTheDocument();

    expect(screen.getByText("약관 · 정보")).toBeInTheDocument();
    expect(screen.getByText("이용약관")).toBeInTheDocument();
    expect(screen.getByText("개인정보처리방침")).toBeInTheDocument();
  });

  it("프로필 설정 행은 기존 쿼리(userId·appVersion)를 승계해 /profile 로 이동한다 (BY-409)", () => {
    render(
      <MemoryRouter initialEntries={["/settings?userId=7&appVersion=1.4.2"]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<LocationProbe testId="profile-stub" />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "프로필 설정" }));

    expect(screen.getByTestId("profile-stub").textContent).toBe(
      "/profile?userId=7&appVersion=1.4.2",
    );
  });

  it("측정 기준 안내 행은 버튼으로 노출되고 클릭 시 온보딩 가이드로 이동한다 (entry=settings, BY-334)", () => {
    renderSettingsWithGuideStub("/settings");

    fireEvent.click(screen.getByRole("button", { name: "측정 기준 안내" }));

    expect(screen.getByTestId("onboarding-guide-stub").textContent).toBe(
      "/onboarding-guide?entry=settings",
    );
  });

  it("측정 기준 안내는 기존 쿼리(userId·appVersion)를 잃지 않고 entry만 얹어 승계한다 (리뷰 반영)", () => {
    renderSettingsWithGuideStub("/settings?userId=7&appVersion=1.4.2");

    fireEvent.click(screen.getByRole("button", { name: "측정 기준 안내" }));

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

  it("이용약관 행은 /terms 로 이동한다", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "이용약관" }));

    expect(screen.getByRole("heading", { name: TERMS_OF_SERVICE.title })).toBeInTheDocument();
  });

  it("개인정보처리방침 행은 /privacy 로 이동한다", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "개인정보처리방침" }));

    expect(screen.getByRole("heading", { name: PRIVACY_POLICY.title })).toBeInTheDocument();
  });

  it("오픈소스 라이선스 행은 /licenses 로 이동한다 (BY-310)", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("button", { name: "오픈소스 라이선스" }));

    expect(screen.getByRole("heading", { name: "Open Source Licenses" })).toBeInTheDocument();
  });

  it("appVersion 쿼리를 버전 정보 행에 반영한다", () => {
    renderAt("/settings?appVersion=1.4.2");

    expect(screen.getByText("1.4.2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "버전 정보" })).not.toBeInTheDocument();
  });

  it("appVersion 쿼리가 없으면 알 수 없음으로 표시한다", () => {
    renderAt("/settings");

    expect(screen.getByText("알 수 없음")).toBeInTheDocument();
  });

  it("카메라 권한 행은 클릭 시 open-settings 메시지를 네이티브로 보낸다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));

    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" }));

    expect(postMessage).toHaveBeenCalledWith('{"type":"open-settings","atMs":1000}');
    // 설정 탭에서 OS 설정을 연 횟수(BY-616 확장) — 권한 회복 퍼널의 중간 단계.
    expect(analytics.trackOsSettingsOpened).toHaveBeenCalledWith("settings_tab");
  });

  it("브라우저 단독 모드(브리지 없음)에서 카메라 권한 행을 눌러도 죽지 않는다", () => {
    renderAt("/settings");

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" }));
    }).not.toThrow();
  });

  describe("카메라 권한 토글", () => {
    /** 네이티브가 `injectJavaScript`로 호출하는 전역을 테스트에서 대신 부른다. */
    function pushCameraPermission(granted: boolean) {
      const receive = (globalThis as unknown as Record<string, (raw: string) => void>)[
        NATIVE_MESSAGE_ENTRY
      ];
      act(() => {
        receive(JSON.stringify({ type: "camera-permission", granted, atMs: 1 }));
      });
    }

    it("마운트되면 네이티브에 권한 상태를 물어본다", () => {
      const postMessage = vi.fn();
      vi.stubGlobal("ReactNativeWebView", { postMessage });

      renderAt("/settings");

      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"type":"request-camera-permission"'),
      );
    });

    it("답을 받기 전에는 토글을 그리지 않는다 — 모름을 '허용 안 됨'으로 단언하지 않는다", () => {
      vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

      renderAt("/settings");

      expect(
        screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" }),
      ).toBeInTheDocument();
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

    it("브라우저 단독 모드에서는 묻지도, 토글을 그리지도 않는다", () => {
      renderAt("/settings");

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(
        screen.getByRole("button", { name: "카메라 권한, 시스템 설정 열기" }),
      ).toBeInTheDocument();
    });
  });
});

describe("프로필 저장 완료 토스트 (2026-08-25 BY-427 시안 A)", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("저장 플래그가 있으면 탭 바 복귀가 끝난 뒤 토스트를 보여주고 플래그를 소비한다", () => {
    vi.useFakeTimers();
    markProfileSaved();
    const { unmount } = renderAt("/settings");

    // 마운트 직후에는 아직 뜨지 않는다 — 네이티브 탭 바 복귀 애니메이션이 웹뷰 높이를
    // 바꾸는 동안 하단 고정 토스트가 따라 움직이는 점프를 피한다(2026-08-25 실기기 피드백).
    expect(screen.queryByText("프로필이 저장됐어요")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("프로필이 저장됐어요")).toBeInTheDocument();

    // 플래그는 1회성이다 — 다시 마운트하면(다른 경로로 재진입 등) 뜨지 않는다.
    unmount();
    renderAt("/settings");
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.queryByText("프로필이 저장됐어요")).not.toBeInTheDocument();
  });

  it("플래그가 없으면 토스트가 뜨지 않는다", () => {
    renderAt("/settings");

    expect(screen.queryByText("프로필이 저장됐어요")).not.toBeInTheDocument();
  });
});
