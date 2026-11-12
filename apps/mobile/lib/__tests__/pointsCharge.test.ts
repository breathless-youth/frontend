import { awaitAuth } from "../auth";
import {
  __resetPointsChargeForTests,
  isPointsChargeSupported,
  pointsChargePrices,
  purchasePointsCharge,
  setPointsChargeAdapter,
} from "../pointsCharge";
import { parseToNativeMessage } from "../webBridge";

jest.mock("../auth", () => ({ awaitAuth: jest.fn() }));

const adapter = { logIn: jest.fn(), prices: jest.fn(), purchase: jest.fn() };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  __resetPointsChargeForTests();
  (awaitAuth as jest.Mock).mockResolvedValue({ userId: 1685, accessToken: "a", refreshToken: "r" });
  adapter.logIn.mockResolvedValue(undefined);
  adapter.purchase.mockResolvedValue(true);
});

describe("포인트 충전 결제", () => {
  it("어댑터가 없으면 지원하지 않고 결제는 실패, 가격은 빈 목록이다", async () => {
    expect(isPointsChargeSupported()).toBe(false);
    expect(await purchasePointsCharge("points_1000")).toBe("failed");
    expect(await pointsChargePrices(["points_1000"])).toEqual([]);
  });

  it("결제 전에 지금 사용자 ID를 문자열로 로그인한다", async () => {
    setPointsChargeAdapter(adapter);
    const order: string[] = [];
    adapter.logIn.mockImplementation(async (id: string) => void order.push(`logIn:${id}`));
    adapter.purchase.mockImplementation(async (id: string) => {
      order.push(`purchase:${id}`);
      return true;
    });

    expect(await purchasePointsCharge("points_1000")).toBe("completed");
    expect(order).toEqual(["logIn:1685", "purchase:points_1000"]);
  });

  it("로그인에 실패하면 결제하지 않는다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.logIn.mockRejectedValue(new Error("network"));

    expect(await purchasePointsCharge("points_1000")).toBe("failed");
    expect(adapter.purchase).not.toHaveBeenCalled();
  });

  it("인증 상태가 없으면 결제하지 않는다", async () => {
    setPointsChargeAdapter(adapter);
    (awaitAuth as jest.Mock).mockResolvedValue(null);

    expect(await purchasePointsCharge("points_1000")).toBe("failed");
    expect(adapter.logIn).not.toHaveBeenCalled();
  });

  it("사용자가 결제 창을 닫으면 취소, SDK 오류는 실패다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.purchase.mockResolvedValueOnce(false);
    expect(await purchasePointsCharge("points_1000")).toBe("cancelled");

    adapter.purchase.mockRejectedValueOnce(new Error("store"));
    expect(await purchasePointsCharge("points_1000")).toBe("failed");
  });

  it("결제 창이 떠 있는 동안 온 두 번째 요청은 취소로 답하고 끝나면 다시 받는다", async () => {
    setPointsChargeAdapter(adapter);
    let finish: (done: boolean) => void = () => {};
    adapter.purchase.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );

    const first = purchasePointsCharge("points_1000");
    expect(await purchasePointsCharge("points_1000")).toBe("cancelled");
    // 첫 요청이 인증과 로그인을 지나 결제 창을 띄울 때까지 기다린다.
    while (adapter.purchase.mock.calls.length === 0) {
      await Promise.resolve();
    }
    finish(true);
    expect(await first).toBe("completed");
    expect(await purchasePointsCharge("points_1000")).toBe("completed");
  });

  it("가격 조회가 실패하면 빈 목록이다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.prices.mockRejectedValue(new Error("store"));
    expect(await pointsChargePrices(["points_1000"])).toEqual([]);
  });
});

describe("충전 브리지 메시지 파싱", () => {
  const parse = (value: unknown) => parseToNativeMessage(JSON.stringify(value));

  it("상품 ID 형식이 맞는 요청만 받는다", () => {
    expect(
      parse({ type: "points-charge-purchase", id: "1", storeProductId: "points_1000", atMs: 1 }),
    ).toEqual({ type: "points-charge-purchase", id: "1", storeProductId: "points_1000", atMs: 1 });
    expect(
      parse({ type: "points-charge-purchase", id: "1", storeProductId: "a b;c", atMs: 1 }),
    ).toBeNull();
    expect(
      parse({ type: "points-charge-purchase", id: "", storeProductId: "p", atMs: 1 }),
    ).toBeNull();
    expect(
      parse({ type: "points-charge-prices", id: "1", storeProductIds: ["p1", "p2"], atMs: 1 }),
    ).toEqual({ type: "points-charge-prices", id: "1", storeProductIds: ["p1", "p2"], atMs: 1 });
    expect(
      parse({ type: "points-charge-prices", id: "1", storeProductIds: ["p1", 2], atMs: 1 }),
    ).toBeNull();
  });
});
