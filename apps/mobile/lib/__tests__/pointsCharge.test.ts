import { awaitAuth } from "../auth";
import {
  __resetPointsChargeForTests,
  isPointsChargeSupported,
  pointsChargePrices,
  purchasePointsCharge,
  restorePointsPurchases,
  setPointsChargeAdapter,
} from "../pointsCharge";
import { parseToNativeMessage } from "../webBridge";

jest.mock("../auth", () => ({ awaitAuth: jest.fn() }));

const adapter = { logIn: jest.fn(), prices: jest.fn(), purchase: jest.fn(), restore: jest.fn() };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  __resetPointsChargeForTests();
  (awaitAuth as jest.Mock).mockResolvedValue({ userId: 1685, accessToken: "a", refreshToken: "r" });
  adapter.logIn.mockResolvedValue(undefined);
  adapter.purchase.mockResolvedValue(true);
  adapter.restore.mockResolvedValue([]);
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

describe("구매 복원", () => {
  it("어댑터가 없으면 실패로 답한다", async () => {
    expect(await restorePointsPurchases(["set_book_bear"])).toBe("failed");
  });

  it("지금 사용자 ID로 로그인한 뒤 복원하고, 되찾을 상품이 결제 기록에 있으면 되찾았다고 답한다", async () => {
    setPointsChargeAdapter(adapter);
    const order: string[] = [];
    adapter.logIn.mockImplementation(async (id: string) => void order.push(`logIn:${id}`));
    adapter.restore.mockImplementation(async () => {
      order.push("restore");
      return ["points_1000", "set_book_bear"];
    });

    expect(await restorePointsPurchases(["set_book_bear", "set_book_rain"])).toBe("restored");
    expect(order).toEqual(["logIn:1685", "restore"]);
  });

  it("결제 기록에 되찾을 상품이 없으면 없다고 답한다", async () => {
    setPointsChargeAdapter(adapter);
    // 충전 묶음은 써서 없어지는 상품이라 결제 기록에 있어도 되찾을 것으로 세지 않는다.
    adapter.restore.mockResolvedValue(["points_1000"]);

    expect(await restorePointsPurchases(["set_book_bear"])).toBe("nothing");
  });

  it("인증 상태가 없거나 로그인·복원이 실패하면 실패로 답한다", async () => {
    setPointsChargeAdapter(adapter);
    (awaitAuth as jest.Mock).mockResolvedValueOnce(null);
    expect(await restorePointsPurchases(["set_book_bear"])).toBe("failed");
    expect(adapter.logIn).not.toHaveBeenCalled();

    adapter.logIn.mockRejectedValueOnce(new Error("network"));
    expect(await restorePointsPurchases(["set_book_bear"])).toBe("failed");
    expect(adapter.restore).not.toHaveBeenCalled();

    adapter.restore.mockRejectedValueOnce(new Error("store"));
    expect(await restorePointsPurchases(["set_book_bear"])).toBe("failed");
  });

  it("결제 창이 떠 있는 동안 온 복원 요청은 실패로 답하고, 복원 중에 온 결제 요청은 취소로 답한다", async () => {
    setPointsChargeAdapter(adapter);
    let finishPurchase: (done: boolean) => void = () => {};
    adapter.purchase.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishPurchase = resolve)),
    );
    const purchase = purchasePointsCharge("points_1000");
    expect(await restorePointsPurchases(["set_book_bear"])).toBe("failed");
    while (adapter.purchase.mock.calls.length === 0) {
      await Promise.resolve();
    }
    finishPurchase(true);
    await purchase;

    let finishRestore: (ids: string[]) => void = () => {};
    adapter.restore.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (finishRestore = resolve)),
    );
    const restore = restorePointsPurchases(["set_book_bear"]);
    expect(await purchasePointsCharge("points_1000")).toBe("cancelled");
    while (adapter.restore.mock.calls.length === 0) {
      await Promise.resolve();
    }
    finishRestore(["set_book_bear"]);
    expect(await restore).toBe("restored");
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

  it("복원 요청은 id와 형식이 맞는 상품 ID 목록이 있어야 받는다", () => {
    const restore = { type: "points-charge-restore", id: "1", storeProductIds: ["set_1"], atMs: 1 };
    expect(parse(restore)).toEqual(restore);
    expect(parse({ ...restore, storeProductIds: [] })).toEqual({ ...restore, storeProductIds: [] });
    expect(parse({ ...restore, id: "" })).toBeNull();
    expect(parse({ ...restore, storeProductIds: ["a b"] })).toBeNull();
    expect(parse({ ...restore, storeProductIds: "set_1" })).toBeNull();
    expect(
      parse({ ...restore, storeProductIds: Array.from({ length: 201 }, (_, i) => `set_${i}`) }),
    ).toBeNull();
  });
});
