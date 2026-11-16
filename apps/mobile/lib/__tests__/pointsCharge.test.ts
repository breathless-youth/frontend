import {
  __resetPointsChargeForTests,
  isPointsChargeSupported,
  pointsChargePrices,
  purchasePointsCharge,
  restorePointsPurchases,
  setPointsChargeAdapter,
} from "../pointsCharge";
import { parseToNativeMessage } from "../webBridge";

// 서버가 내려 준 결제용 ID이며 회원번호와 다른 값이다.
const APP_USER_ID = "0b9f6a3e-6c1d-4d2a-9a51-3f1c2b7e8d90";

const adapter = { logIn: jest.fn(), prices: jest.fn(), purchase: jest.fn(), restore: jest.fn() };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  __resetPointsChargeForTests();
  adapter.logIn.mockResolvedValue(undefined);
  adapter.purchase.mockResolvedValue(true);
  adapter.restore.mockResolvedValue([]);
});

describe("포인트 충전 결제", () => {
  it("어댑터가 없으면 지원하지 않고 결제는 실패, 가격은 빈 목록이다", async () => {
    expect(isPointsChargeSupported()).toBe(false);
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("failed");
    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual([]);
  });

  it("결제 전에 웹이 넘긴 결제용 ID로 로그인한다", async () => {
    setPointsChargeAdapter(adapter);
    const order: string[] = [];
    adapter.logIn.mockImplementation(async (id: string) => void order.push(`logIn:${id}`));
    adapter.purchase.mockImplementation(async (id: string) => {
      order.push(`purchase:${id}`);
      return true;
    });

    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("completed");
    expect(order).toEqual([`logIn:${APP_USER_ID}`, "purchase:points_1000"]);
  });

  it("로그인에 실패하면 결제하지 않는다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.logIn.mockRejectedValue(new Error("network"));

    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("failed");
    expect(adapter.purchase).not.toHaveBeenCalled();
  });

  it("결제용 ID가 없으면 회원번호로 대신 로그인하지 않고 결제하지 않는다", async () => {
    setPointsChargeAdapter(adapter);

    expect(await purchasePointsCharge("points_1000", null)).toBe("failed");
    expect(adapter.logIn).not.toHaveBeenCalled();
    expect(adapter.purchase).not.toHaveBeenCalled();
  });

  it("사용자가 결제 창을 닫으면 취소, SDK 오류는 실패다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.purchase.mockResolvedValueOnce(false);
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("cancelled");

    adapter.purchase.mockRejectedValueOnce(new Error("store"));
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("failed");
  });

  it("결제 창이 떠 있는 동안 온 두 번째 요청은 취소로 답하고 끝나면 다시 받는다", async () => {
    setPointsChargeAdapter(adapter);
    let finish: (done: boolean) => void = () => {};
    adapter.purchase.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );

    const first = purchasePointsCharge("points_1000", APP_USER_ID);
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("cancelled");
    // 첫 요청이 로그인을 지나 결제 창을 띄울 때까지 기다린다.
    while (adapter.purchase.mock.calls.length === 0) {
      await Promise.resolve();
    }
    finish(true);
    expect(await first).toBe("completed");
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("completed");
  });

  it("가격을 묻기 전에 결제용 ID로 로그인하고, 없으면 로그인 없이 묻는다", async () => {
    setPointsChargeAdapter(adapter);
    const prices = [{ storeProductId: "points_1000", priceLabel: "₩1,100" }];
    const order: string[] = [];
    adapter.logIn.mockImplementation(async (id: string) => void order.push(`logIn:${id}`));
    adapter.prices.mockImplementation(async () => {
      order.push("prices");
      return prices;
    });

    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual(prices);
    expect(order).toEqual([`logIn:${APP_USER_ID}`, "prices"]);

    order.length = 0;
    expect(await pointsChargePrices(["points_1000"], null)).toEqual(prices);
    expect(order).toEqual(["prices"]);
  });

  it("가격만 묻는 때는 로그인이 실패해도 가격을 돌려준다", async () => {
    setPointsChargeAdapter(adapter);
    const prices = [{ storeProductId: "points_1000", priceLabel: "₩1,100" }];
    adapter.logIn.mockRejectedValue(new Error("network"));
    adapter.prices.mockResolvedValue(prices);

    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual(prices);
  });

  it("가격 조회가 실패하면 빈 목록이다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.prices.mockRejectedValue(new Error("store"));
    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual([]);
  });
});

describe("구매 복원", () => {
  it("어댑터가 없으면 실패로 답한다", async () => {
    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("failed");
  });

  it("결제용 ID로 로그인한 뒤 복원하고, 되찾을 상품이 결제 기록에 있으면 되찾았다고 답한다", async () => {
    setPointsChargeAdapter(adapter);
    const order: string[] = [];
    adapter.logIn.mockImplementation(async (id: string) => void order.push(`logIn:${id}`));
    adapter.restore.mockImplementation(async () => {
      order.push("restore");
      return ["points_1000", "set_book_bear"];
    });

    expect(await restorePointsPurchases(["set_book_bear", "set_book_rain"], APP_USER_ID)).toBe(
      "restored",
    );
    expect(order).toEqual([`logIn:${APP_USER_ID}`, "restore"]);
  });

  it("결제 기록에 되찾을 상품이 없으면 없다고 답한다", async () => {
    setPointsChargeAdapter(adapter);
    // 충전 묶음은 써서 없어지는 상품이라 결제 기록에 있어도 되찾을 것으로 세지 않는다.
    adapter.restore.mockResolvedValue(["points_1000"]);

    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("nothing");
  });

  it("결제용 ID가 없거나 로그인·복원이 실패하면 실패로 답한다", async () => {
    setPointsChargeAdapter(adapter);
    expect(await restorePointsPurchases(["set_book_bear"], null)).toBe("failed");
    expect(adapter.logIn).not.toHaveBeenCalled();
    expect(adapter.restore).not.toHaveBeenCalled();

    adapter.logIn.mockRejectedValueOnce(new Error("network"));
    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("failed");
    expect(adapter.restore).not.toHaveBeenCalled();

    adapter.restore.mockRejectedValueOnce(new Error("store"));
    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("failed");
  });

  it("결제 창이 떠 있는 동안 온 복원 요청은 실패로 답하고, 복원 중에 온 결제 요청은 취소로 답한다", async () => {
    setPointsChargeAdapter(adapter);
    let finishPurchase: (done: boolean) => void = () => {};
    adapter.purchase.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishPurchase = resolve)),
    );
    const purchase = purchasePointsCharge("points_1000", APP_USER_ID);
    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("failed");
    while (adapter.purchase.mock.calls.length === 0) {
      await Promise.resolve();
    }
    finishPurchase(true);
    await purchase;

    let finishRestore: (ids: string[]) => void = () => {};
    adapter.restore.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => (finishRestore = resolve)),
    );
    const restore = restorePointsPurchases(["set_book_bear"], APP_USER_ID);
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("cancelled");
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
    const purchase = {
      type: "points-charge-purchase",
      id: "1",
      storeProductId: "points_1000",
      appUserId: APP_USER_ID,
      atMs: 1,
    };
    expect(parse(purchase)).toEqual(purchase);
    expect(parse({ ...purchase, storeProductId: "a b;c" })).toBeNull();
    expect(parse({ ...purchase, id: "" })).toBeNull();
    const prices = {
      type: "points-charge-prices",
      id: "1",
      storeProductIds: ["p1", "p2"],
      appUserId: APP_USER_ID,
      atMs: 1,
    };
    expect(parse(prices)).toEqual(prices);
    expect(parse({ ...prices, storeProductIds: ["p1", 2] })).toBeNull();
  });

  it.each(["points-charge-purchase", "points-charge-prices", "points-charge-restore"])(
    "%s의 결제용 ID가 없거나 형식이 다르면 null로 받아 답은 하되 그 값으로 로그인하지 않는다",
    (type) => {
      const base = { type, id: "1", storeProductId: "p1", storeProductIds: ["p1"], atMs: 1 };
      for (const appUserId of [undefined, null, "", "a b", "$RCAnonymousID:abc", 42]) {
        expect(parse({ ...base, appUserId })).toMatchObject({ type, appUserId: null });
      }
    },
  );

  it("복원 요청은 id와 형식이 맞는 상품 ID 목록이 있어야 받는다", () => {
    const restore = {
      type: "points-charge-restore",
      id: "1",
      storeProductIds: ["set_1"],
      appUserId: APP_USER_ID,
      atMs: 1,
    };
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
