import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { consumeStudyResultExit } from "@/lib/amplitude";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AnalyticsRouteTracker />
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

  it("이미 떠 있는 홈이 다시 보이게 되면 또 확인한다 — 네이티브 모달 닫힘 경로", () => {
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
});
