import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativePointsChargeForTests,
  isNativePointsChargeAvailable,
  requestNativePointsPrices,
  requestNativePointsPurchase,
} from "@/lib/nativePointsCharge";

const postMessage = vi.fn();

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  postMessage.mockReset();
  window.history.replaceState(null, "", "/");
  __resetNativePointsChargeForTests();
});

function enable(query = "?pointsCharge=1") {
  window.history.replaceState(null, "", `/points${query}`);
  __resetNativePointsChargeForTests();
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

describe("앱 포인트 충전 브리지", () => {
  it("브리지와 pointsCharge=1 표시가 모두 있어야 쓸 수 있다", () => {
    expect(isNativePointsChargeAvailable()).toBe(false);
    enable("");
    expect(isNativePointsChargeAvailable()).toBe(false);
    enable();
    expect(isNativePointsChargeAvailable()).toBe(true);
  });

  it("같은 id의 결제 결과로 끝나고 모르는 상태는 실패로 받는다", async () => {
    enable();
    const first = requestNativePointsPurchase("points_1000");
    const request = lastRequest();
    expect(request).toMatchObject({
      type: "points-charge-purchase",
      storeProductId: "points_1000",
    });
    fromNative({
      type: "points-charge-purchase-result",
      id: "other",
      status: "completed",
      atMs: 1,
    });
    fromNative({
      type: "points-charge-purchase-result",
      id: request.id,
      status: "completed",
      atMs: 1,
    });
    expect(await first).toBe("completed");

    const second = requestNativePointsPurchase("points_1000");
    fromNative({
      type: "points-charge-purchase-result",
      id: lastRequest().id,
      status: "refunded",
      atMs: 1,
    });
    expect(await second).toBe("failed");
  });

  it("브리지가 없으면 결제는 실패로 끝난다", async () => {
    expect(await requestNativePointsPurchase("points_1000")).toBe("failed");
  });

  it("가격 응답에서 형식이 맞는 항목만 받는다", async () => {
    enable();
    const pending = requestNativePointsPrices(["points_1000", "points_3000"]);
    fromNative({
      type: "points-charge-prices-result",
      id: lastRequest().id,
      prices: [{ storeProductId: "points_1000", priceLabel: "₩1,100" }, { storeProductId: 3 }],
      atMs: 1,
    });
    expect(await pending).toEqual([{ storeProductId: "points_1000", priceLabel: "₩1,100" }]);
  });

  it("앱이 가격에 답하지 않으면 빈 목록으로 끝낸다", async () => {
    vi.useFakeTimers();
    enable();
    const pending = requestNativePointsPrices(["points_1000"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual([]);
  });
});
