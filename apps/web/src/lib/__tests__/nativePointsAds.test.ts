import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativePointsAdsForTests,
  isNativePointsAdsAvailable,
  requestNativePointsAd,
} from "@/lib/nativePointsAds";

const postMessage = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  postMessage.mockReset();
  window.history.replaceState(null, "", "/");
  __resetNativePointsAdsForTests();
});

function enable(query = "?pointsAds=1") {
  window.history.replaceState(null, "", `/points${query}`);
  __resetNativePointsAdsForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
}

function lastRequest(): { type: string; id: string } {
  return JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as { type: string; id: string };
}

function fromNative(message: unknown) {
  (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY](
    JSON.stringify(message),
  );
}

describe("앱 보상형 광고 브리지", () => {
  it("브리지와 pointsAds=1 표시가 모두 있어야 쓸 수 있다", () => {
    expect(isNativePointsAdsAvailable()).toBe(false);
    enable("");
    expect(isNativePointsAdsAvailable()).toBe(false);
    enable();
    expect(isNativePointsAdsAvailable()).toBe(true);
  });

  it("같은 id의 결과로만 끝난다", async () => {
    enable();
    const pending = requestNativePointsAd();
    const request = lastRequest();
    expect(request.type).toBe("points-ad-show");

    let settled = false;
    void pending.then(() => (settled = true));
    fromNative({ type: "points-ad-show-result", id: "other", status: "rewarded", atMs: 1 });
    await Promise.resolve();
    expect(settled).toBe(false);

    fromNative({ type: "points-ad-show-result", id: request.id, status: "rewarded", atMs: 2 });
    expect(await pending).toBe("rewarded");
  });

  it("앱이 보낸 모르는 상태는 볼 수 있는 광고 없음으로 받는다", async () => {
    enable();
    const pending = requestNativePointsAd();
    fromNative({ type: "points-ad-show-result", id: lastRequest().id, status: "later", atMs: 1 });
    expect(await pending).toBe("unavailable");
  });

  it("브리지가 없으면 요청하지 않고 볼 수 있는 광고 없음으로 끝낸다", async () => {
    expect(await requestNativePointsAd()).toBe("unavailable");
    expect(postMessage).not.toHaveBeenCalled();
  });
});
