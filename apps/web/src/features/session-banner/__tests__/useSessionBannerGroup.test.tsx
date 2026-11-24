import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import i18n from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import type * as UserId from "@/lib/userId";

import { assignSessionBannerArm } from "../sessionBanner";
import { loadSessionBannerGroup, saveSessionBannerGroup } from "../sessionBannerStore";
import { useSessionBannerGroup } from "../useSessionBannerGroup";

const analytics = vi.hoisted(() => ({ setSessionBannerGroupUserProperty: vi.fn() }));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));
const tokenSource = vi.hoisted(() => ({ present: true }));
vi.mock("@/lib/userId", async (o) => ({
  ...(await o<typeof UserId>()),
  hasTokenSource: () => tokenSource.present,
}));

const USER_ID = 7;
const STUDIED = [
  { date: "2026-11-12", studySec: 600, focusSec: 600 },
  { date: "2026-11-15", studySec: 600, focusSec: 600 },
  { date: "2026-11-20", studySec: 600, focusSec: 600 },
];

function stubApi({ stats, guest = false }: { stats: Promise<Response>; guest?: boolean }) {
  const fetch = vi.fn(async (input: string) => {
    if (input.includes("/profile")) {
      return Response.json(
        guest ? { nickname: "민준" } : { nickname: "민준", loginProvider: "KAKAO" },
      );
    }
    if (input.includes("/api/stats/period?")) return stats;
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const periodResponse = () =>
  Response.json({
    from: "2026-11-10",
    to: "2026-11-23",
    compareFrom: null,
    compareTo: null,
    dailyList: STUDIED,
    compareDailyList: [],
  });

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-24T12:00:00+09:00") });
  vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  tokenSource.present = true;
  queryClient.clear();
  localStorage.clear();
  await i18n.changeLanguage("ko");
});

describe("useSessionBannerGroup 판정 대상", () => {
  it("비회원, 브라우저, 한국어가 아닌 화면은 판정하지 않는다", async () => {
    const fetch = stubApi({ stats: Promise.resolve(periodResponse()) });

    expect(renderHook(() => useSessionBannerGroup(null), { wrapper }).result.current).toBeNull();

    vi.stubGlobal("ReactNativeWebView", undefined);
    expect(renderHook(() => useSessionBannerGroup(USER_ID), { wrapper }).result.current).toBeNull();

    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    await i18n.changeLanguage("en");
    expect(renderHook(() => useSessionBannerGroup(USER_ID), { wrapper }).result.current).toBeNull();

    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(loadSessionBannerGroup(USER_ID)).toBe("unset");
  });
});

describe("useSessionBannerGroup 토큰 없는 구 앱", () => {
  it("신청을 저장할 수 없는 구 앱은 판정하지 않는다", async () => {
    const fetch = stubApi({ stats: Promise.resolve(periodResponse()) });
    tokenSource.present = false;

    expect(renderHook(() => useSessionBannerGroup(USER_ID), { wrapper }).result.current).toBeNull();

    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(loadSessionBannerGroup(USER_ID)).toBe("unset");
  });
});

describe("useSessionBannerGroup 판정", () => {
  it("통계가 오기 전에는 군이 없고, 온 뒤 한 번 정해 저장하고 사용자 속성을 보낸다", async () => {
    let resolveStats: (res: Response) => void = () => {};
    stubApi({ stats: new Promise((resolve) => (resolveStats = resolve)) });
    const { result } = renderHook(() => useSessionBannerGroup(USER_ID), { wrapper });

    expect(result.current).toBeNull();
    expect(loadSessionBannerGroup(USER_ID)).toBe("unset");

    resolveStats(periodResponse());
    const expected = assignSessionBannerArm(USER_ID);
    await waitFor(() => expect(result.current).toBe(expected));
    expect(loadSessionBannerGroup(USER_ID)).toBe(expected);
    expect(analytics.setSessionBannerGroupUserProperty).toHaveBeenCalledTimes(1);
    expect(analytics.setSessionBannerGroupUserProperty).toHaveBeenCalledWith(expected);
  });

  it("로그인하지 않은 앱 사용자도 공부 기록으로 판정한다", async () => {
    const fetch = stubApi({ stats: Promise.resolve(periodResponse()), guest: true });
    const { result } = renderHook(() => useSessionBannerGroup(USER_ID), { wrapper });

    const expected = assignSessionBannerArm(USER_ID);
    await waitFor(() => expect(result.current).toBe(expected));
    expect(loadSessionBannerGroup(USER_ID)).toBe(expected);
    // 회원인지 보지 않으므로 프로필을 부르지 않는다.
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/profile"))).toBe(false);
  });

  it("저장된 군이 있으면 통계를 부르지 않고 그 군을 쓴다", async () => {
    saveSessionBannerGroup(USER_ID, "not_eligible");
    const fetch = stubApi({ stats: Promise.resolve(periodResponse()) });

    const { result } = renderHook(() => useSessionBannerGroup(USER_ID), { wrapper });

    expect(result.current).toBe("not_eligible");
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(analytics.setSessionBannerGroupUserProperty).not.toHaveBeenCalled();
  });
});
