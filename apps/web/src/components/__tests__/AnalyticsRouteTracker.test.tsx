import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { consumeStudyResultExit } from "@/lib/amplitude";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

import { AnalyticsRouteTracker } from "../AnalyticsRouteTracker";

const mocks = vi.hoisted(() => ({
  source: null as TokenSource | null,
  setAmplitudeUserId: vi.fn(),
  trackAmplitudePageView: vi.fn(),
  trackPageView: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  consumeStudyResultExit: vi.fn(),
  setAmplitudeUserId: mocks.setAmplitudeUserId,
  trackAmplitudePageView: mocks.trackAmplitudePageView,
}));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: mocks.trackPageView }));

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** 네이티브가 주입하는 것과 같은 경로로 신호를 흘려보낸다. mock이 아니라 실물 구독을 지난다. */
function emit(raw: string): void {
  const receiver = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receiver?.(raw);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AnalyticsRouteTracker />
    </MemoryRouter>,
  );
}

/** 같은 문서 안에서 라우트를 옮긴다. 공부 화면 문서가 결과 화면을 거쳐 `/home`으로 가는 길을 흉내낸다. */
let navigateTo: (path: string) => void = () => undefined;

function Navigator() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = (path) => void navigate(path);
  }, [navigate]);
  return null;
}

function renderWithNavigator(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AnalyticsRouteTracker />
      <Navigator />
    </MemoryRouter>,
  );
}

/** `auth-token` 도착을 흉내내는 출처 — 구독자에게 새 userId를 밀어 넣는다. */
function lateArrivingSource(): { source: TokenSource; arrive: (userId: number) => void } {
  let userId: number | null = null;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  const source: TokenSource = {
    getAccessToken: vi.fn(),
    getCurrentToken: vi.fn(),
    refresh: vi.fn(),
    getUserId: () => userId,
    hasSettled: () => true,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    arrive: (next) => {
      userId = next;
      act(() => {
        for (const listener of listeners) {
          listener({ userId: next, accessToken: "t" });
        }
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.source = null;
  vi.mocked(consumeStudyResultExit).mockClear();
  mocks.setAmplitudeUserId.mockClear();
  mocks.trackAmplitudePageView.mockClear();
  mocks.trackPageView.mockClear();
});

describe("AnalyticsRouteTracker — 신원 연결", () => {
  /**
   * 회귀 가드 — BY-528이 웹뷰 URL에서 userId를 빼면서 마운트 시점 신원이 사라졌다. 구독이
   * 없으면 라우트를 바꾸지 않는 탭의 이벤트가 끝까지 익명으로 남는다.
   */
  it("마운트 뒤 도착한 신원을 Amplitude에 붙인다", () => {
    const { source, arrive } = lateArrivingSource();
    mocks.source = source;

    renderAt("/home");
    expect(mocks.setAmplitudeUserId).toHaveBeenLastCalledWith(null);

    arrive(227);
    expect(mocks.setAmplitudeUserId).toHaveBeenLastCalledWith(227);
  });

  /** 신원 이펙트와 페이지뷰 이펙트를 합치면 늦게 온 신원이 페이지뷰를 한 번 더 쏜다. */
  it("신원이 늦게 도착해도 페이지뷰는 한 번만 나간다", () => {
    const { source, arrive } = lateArrivingSource();
    mocks.source = source;

    renderAt("/home");
    arrive(227);

    expect(mocks.trackPageView).toHaveBeenCalledTimes(1);
    expect(mocks.trackAmplitudePageView).toHaveBeenCalledTimes(1);
  });

  /** 브리지 없는 브라우저 단독 모드에서는 URL 폴백이 유일한 경로다. */
  it("토큰 출처가 없으면 URL 쿼리로 폴백한다", () => {
    renderAt("/home?userId=7");
    expect(mocks.setAmplitudeUserId).toHaveBeenLastCalledWith(7);
  });
});

describe("AnalyticsRouteTracker — 결과 이탈 예약 소비", () => {
  it("현재 경로를 그대로 넘긴다 — 내 몫인지 판단은 예약에 못박힌 경로가 한다", () => {
    for (const path of ["/home", "/social", "/records"]) {
      vi.mocked(consumeStudyResultExit).mockClear();
      renderAt(`${path}?userId=7`);
      expect(consumeStudyResultExit).toHaveBeenCalledWith(path);
    }
  });

  it("앱을 다시 켜서 이미 떠 있는 홈이 보이게 되면 또 확인한다", () => {
    const { unmount } = renderAt("/home?userId=7");
    vi.mocked(consumeStudyResultExit).mockClear();

    setVisibility("hidden");
    expect(consumeStudyResultExit).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(consumeStudyResultExit).toHaveBeenCalledTimes(1);

    unmount();
    setVisibility("visible");
    expect(consumeStudyResultExit).toHaveBeenCalledTimes(1);
  });

  /**
   * 공부 화면 모달이 닫혀도 아래 탭 웹뷰에는 라우트 변경도 `visibilitychange`도 오지 않는다.
   * 앱이 모달을 닫으며 보내는 `session-closed`가 탭 웹뷰가 받는 유일한 신호다.
   */
  it("공부 화면이 닫혔다는 앱 신호를 받으면 지금 경로로 다시 확인한다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    const { unmount } = renderAt("/home");
    vi.mocked(consumeStudyResultExit).mockClear();

    emit('{"type":"app-launched","atMs":1}');
    expect(consumeStudyResultExit).not.toHaveBeenCalled();

    emit('{"type":"session-closed","atMs":1}');
    expect(consumeStudyResultExit).toHaveBeenCalledTimes(1);
    expect(consumeStudyResultExit).toHaveBeenCalledWith("/home");

    unmount();
    emit('{"type":"session-closed","atMs":2}');
    expect(consumeStudyResultExit).toHaveBeenCalledTimes(1);
  });

  /** 결과 화면의 `기록으로 가기`도 모달을 닫으며 같은 신호를 보내고, 기록 탭은 자기 경로 몫만 가져간다. */
  it("기록 탭도 앱 신호를 받으면 자기 경로로 확인한다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    renderAt("/records");
    vi.mocked(consumeStudyResultExit).mockClear();

    emit('{"type":"session-closed","atMs":1}');

    expect(consumeStudyResultExit).toHaveBeenCalledWith("/records");
  });

  /** 소셜 라이브룸은 소셜 탭 문서 안에서 열려 경로에 `/room/`이 들어가도 공부 화면 문서가 아니다. */
  it("소셜 탭은 라이브룸으로 옮겨 가도 계속 확인한다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    renderWithNavigator("/social");
    act(() => navigateTo("/social/room/1"));

    expect(consumeStudyResultExit).toHaveBeenLastCalledWith("/social/room/1");
  });

  /**
   * `홈으로`를 누르면 공부 화면 문서도 폴백으로 `/home`에 간다.
   * 여기서 가져가면 곧 닫힐 웹뷰가 이벤트를 들고 사라지고, 정작 홈 탭은 보낼 것이 없다.
   */
  it("앱 안에서 공부 화면으로 열린 문서는 /home으로 옮겨 가도 확인하지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    renderWithNavigator("/room/1");
    act(() => navigateTo("/room/1/result"));
    act(() => navigateTo("/home"));

    emit('{"type":"session-closed","atMs":1}');
    setVisibility("visible");

    expect(consumeStudyResultExit).not.toHaveBeenCalled();
  });

  /** 브라우저에서는 공부 화면과 홈이 한 문서라, 그 문서가 `/home`에 도착해 가져가는 것이 유일한 길이다. */
  it("브라우저 단독 모드에서는 공부 화면에서 시작한 문서도 /home에 도착하면 확인한다", () => {
    renderWithNavigator("/room/1");
    act(() => navigateTo("/home"));

    expect(consumeStudyResultExit).toHaveBeenLastCalledWith("/home");
  });
});
