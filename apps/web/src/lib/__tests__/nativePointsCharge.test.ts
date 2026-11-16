import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativePointsChargeForTests,
  isNativePointsChargeAvailable,
  isNativePointsRestoreAvailable,
  requestNativePointsPrices,
  requestNativePointsPurchase,
  requestNativePointsRestore,
} from "@/lib/nativePointsCharge";

const postMessage = vi.fn();
const APP_USER_ID = "0b9f6a3e-6c1d-4d2a-9a51-3f1c2b7e8d90";

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

function lastRequest(): { type: string; id: string; storeProductIds?: string[] } {
  return JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as {
    type: string;
    id: string;
    storeProductIds?: string[];
  };
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
    const first = requestNativePointsPurchase("points_1000", APP_USER_ID);
    const request = lastRequest();
    expect(request).toMatchObject({
      type: "points-charge-purchase",
      storeProductId: "points_1000",
      appUserId: APP_USER_ID,
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

    const second = requestNativePointsPurchase("points_1000", APP_USER_ID);
    fromNative({
      type: "points-charge-purchase-result",
      id: lastRequest().id,
      status: "refunded",
      atMs: 1,
    });
    expect(await second).toBe("failed");
  });

  it("브리지가 없으면 결제는 실패로 끝난다", async () => {
    expect(await requestNativePointsPurchase("points_1000", APP_USER_ID)).toBe("failed");
  });

  it("가격 응답에서 형식이 맞는 항목만 받는다", async () => {
    enable();
    const pending = requestNativePointsPrices(["points_1000", "points_3000"], APP_USER_ID);
    fromNative({
      type: "points-charge-prices-result",
      id: lastRequest().id,
      prices: [{ storeProductId: "points_1000", priceLabel: "₩1,100" }, { storeProductId: 3 }],
      atMs: 1,
    });
    expect(await pending).toEqual([{ storeProductId: "points_1000", priceLabel: "₩1,100" }]);
  });

  it("가격 요청에 결제용 ID를 싣는다", () => {
    enable();
    void requestNativePointsPrices(["points_1000"], APP_USER_ID);
    expect(lastRequest()).toMatchObject({ type: "points-charge-prices", appUserId: APP_USER_ID });
  });

  it("앱이 가격에 답하지 않으면 빈 목록으로 끝낸다", async () => {
    vi.useFakeTimers();
    enable();
    const pending = requestNativePointsPrices(["points_1000"], APP_USER_ID);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual([]);
  });
});

describe("앱 구매 복원 브리지", () => {
  it("브리지와 pointsRestore=1 표시가 모두 있어야 쓸 수 있다", () => {
    expect(isNativePointsRestoreAvailable()).toBe(false);
    // 복원 메시지가 생기기 전의 앱은 충전 표시만 붙인다.
    enable("?pointsCharge=1");
    expect(isNativePointsRestoreAvailable()).toBe(false);
    enable("?pointsCharge=1&pointsRestore=1");
    expect(isNativePointsRestoreAvailable()).toBe(true);
  });

  it("되찾을 상품 ID를 실어 보내고 같은 id의 결과로 끝난다", async () => {
    enable("?pointsRestore=1");
    const pending = requestNativePointsRestore(["set_book_bear"], APP_USER_ID);
    const request = lastRequest();
    expect(request).toMatchObject({
      type: "points-charge-restore",
      storeProductIds: ["set_book_bear"],
      appUserId: APP_USER_ID,
    });
    fromNative({ type: "points-charge-restore-result", id: "other", status: "nothing", atMs: 1 });
    fromNative({
      type: "points-charge-restore-result",
      id: request.id,
      status: "restored",
      atMs: 1,
    });
    expect(await pending).toBe("restored");
  });

  it("앱이 보낸 모르는 상태는 실패로 받는다", async () => {
    enable("?pointsRestore=1");
    const pending = requestNativePointsRestore(["set_book_bear"], APP_USER_ID);
    fromNative({
      type: "points-charge-restore-result",
      id: lastRequest().id,
      status: "transferred",
      atMs: 1,
    });
    expect(await pending).toBe("failed");
  });

  it("앱이 받는 수보다 많은 상품 ID는 잘라서 보낸다", () => {
    enable("?pointsRestore=1");
    void requestNativePointsRestore(
      Array.from({ length: 250 }, (_, index) => `set_${index}`),
      APP_USER_ID,
    );
    expect(lastRequest().storeProductIds).toHaveLength(200);
  });

  it("브리지가 없으면 실패로 끝난다", async () => {
    expect(await requestNativePointsRestore(["set_book_bear"], APP_USER_ID)).toBe("failed");
  });
});
