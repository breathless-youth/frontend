import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsRouteTracker } from "@/components/AnalyticsRouteTracker";
import type * as amplitudeModule from "@/lib/amplitude";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";

const mocks = vi.hoisted(() => ({
  source: null as TokenSource | null,
  setAmplitudeUserId: vi.fn(),
  trackAmplitudePageView: vi.fn(),
  trackPageView: vi.fn(),
}));

vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof amplitudeModule>()),
  setAmplitudeUserId: mocks.setAmplitudeUserId,
  trackAmplitudePageView: mocks.trackAmplitudePageView,
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: mocks.trackPageView }));

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
  vi.clearAllMocks();
});

describe("AnalyticsRouteTracker", () => {
  /**
   * 회귀 가드 — BY-528이 웹뷰 URL에서 userId를 빼면서 마운트 시점 신원이 사라졌다. 구독이
   * 없으면 라우트를 바꾸지 않는 탭의 이벤트가 끝까지 익명으로 남는다.
   */
  it("마운트 뒤 도착한 신원을 Amplitude에 붙인다", () => {
    const { source, arrive } = lateArrivingSource();
    mocks.source = source;

    render(
      <MemoryRouter initialEntries={["/home"]}>
        <AnalyticsRouteTracker />
      </MemoryRouter>,
    );
    expect(mocks.setAmplitudeUserId).toHaveBeenLastCalledWith(null);

    arrive(227);
    expect(mocks.setAmplitudeUserId).toHaveBeenLastCalledWith(227);
  });

  /** 신원 이펙트와 페이지뷰 이펙트를 합치면 늦게 온 신원이 페이지뷰를 한 번 더 쏜다. */
  it("신원이 늦게 도착해도 페이지뷰는 한 번만 나간다", () => {
    const { source, arrive } = lateArrivingSource();
    mocks.source = source;

    render(
      <MemoryRouter initialEntries={["/home"]}>
        <AnalyticsRouteTracker />
      </MemoryRouter>,
    );
    arrive(227);

    expect(mocks.trackPageView).toHaveBeenCalledTimes(1);
    expect(mocks.trackAmplitudePageView).toHaveBeenCalledTimes(1);
  });
});
