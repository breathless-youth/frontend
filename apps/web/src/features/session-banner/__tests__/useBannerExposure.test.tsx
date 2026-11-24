import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { SESSION_BANNER_ROTATE_MS } from "../sessionBanner";
import { useBannerExposure } from "../useBannerExposure";

const analytics = vi.hoisted(() => ({
  trackSessionBannerShown: vi.fn(),
  trackSessionBannerImpression: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

const MINUTE_MS = 60_000;
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function renderExposure(active: boolean) {
  const element = document.body.appendChild(document.createElement("button"));
  const target = { current: element };
  return renderHook((props: { active: boolean }) => useBannerExposure({ ...props, target }), {
    wrapper,
    initialProps: { active },
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  setVisibility("visible");
  document.body.innerHTML = "";
});

describe("useBannerExposure", () => {
  it("처음 보일 때 shown을 한 번 보낸다", () => {
    const { rerender } = renderExposure(false);
    expect(analytics.trackSessionBannerShown).not.toHaveBeenCalled();

    rerender({ active: true });
    advance(1000);
    rerender({ active: false });
    rerender({ active: true });
    advance(1000);

    expect(analytics.trackSessionBannerShown).toHaveBeenCalledTimes(1);
    expect(analytics.trackSessionBannerShown).toHaveBeenCalledWith({ copy: 1 });
  });

  it("보인 시간이 5분 쌓이면 impression을 보내고 다음 문구로 바꾼다", () => {
    const { result } = renderExposure(true);
    expect(result.current).toBe(1);

    advance(SESSION_BANNER_ROTATE_MS - 1000);
    expect(analytics.trackSessionBannerImpression).not.toHaveBeenCalled();
    advance(1000);

    expect(analytics.trackSessionBannerImpression).toHaveBeenCalledTimes(1);
    expect(analytics.trackSessionBannerImpression).toHaveBeenCalledWith({ copy: 1, sequence: 1 });
    expect(result.current).toBe(2);
  });

  it("일시정지, 덮임, 앱이 뒤로 간 동안에는 시간을 쌓지 않는다", () => {
    const { rerender } = renderExposure(true);

    advance(3 * MINUTE_MS);
    rerender({ active: false });
    advance(10 * MINUTE_MS);
    rerender({ active: true });
    setVisibility("hidden");
    advance(10 * MINUTE_MS);
    setVisibility("visible");
    advance(2 * MINUTE_MS - 1000);
    expect(analytics.trackSessionBannerImpression).not.toHaveBeenCalled();

    advance(1000);
    expect(analytics.trackSessionBannerImpression).toHaveBeenCalledTimes(1);
  });

  it("세 번째 문구 다음은 첫 문구다", () => {
    const { result } = renderExposure(true);

    advance(3 * SESSION_BANNER_ROTATE_MS);

    expect(analytics.trackSessionBannerImpression.mock.calls).toEqual([
      [{ copy: 1, sequence: 1 }],
      [{ copy: 2, sequence: 2 }],
      [{ copy: 3, sequence: 3 }],
    ]);
    expect(result.current).toBe(1);
  });
});
