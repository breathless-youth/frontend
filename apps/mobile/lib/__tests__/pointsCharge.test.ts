import { POINTS_CHARGE_PRICES_MAX_PRODUCTS } from "@focusmakers/types";
import * as SecureStore from "expo-secure-store";

import {
  __resetPointsChargeForTests,
  forgetPointsChargeUser,
  isPointsChargeSupported,
  pointsChargePrices,
  purchasePointsCharge,
  restorePointsPurchases,
  resumePointsCharge,
  setPointsChargeAdapter,
} from "../pointsCharge";
import { parseToNativeMessage } from "../webBridge";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// 서버가 내려 준 결제용 ID이며 회원번호와 다른 값이다.
const APP_USER_ID = "0b9f6a3e-6c1d-4d2a-9a51-3f1c2b7e8d90";
const OTHER_APP_USER_ID = "5d2c8f10-7a4b-4e3c-8b21-9c0d1e2f3a4b";
const RECORD_KEY = "focuson.pointsCharge";

const adapter = {
  start: jest.fn(),
  logIn: jest.fn(),
  prices: jest.fn(),
  purchase: jest.fn(),
  restore: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  __resetPointsChargeForTests();
  adapter.logIn.mockResolvedValue(undefined);
  adapter.purchase.mockResolvedValue(true);
  adapter.restore.mockResolvedValue([]);
  adapter.prices.mockResolvedValue([]);
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
});

describe("결제 SDK를 켜는 때", () => {
  it("결제용 ID가 실린 첫 요청에서 그 ID로 결제 SDK를 켜고 켠 기록을 남긴다", async () => {
    setPointsChargeAdapter(adapter);

    await pointsChargePrices(["points_1000"], APP_USER_ID);

    expect(adapter.start).toHaveBeenCalledWith(APP_USER_ID);
    expect(adapter.logIn).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      RECORD_KEY,
      APP_USER_ID,
      expect.objectContaining({
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }),
    );
  });

  it("결제용 ID가 없는 가격 조회는 결제 SDK를 켜지 않고 빈 목록으로 답한다", async () => {
    setPointsChargeAdapter(adapter);

    expect(await pointsChargePrices(["points_1000"], null)).toEqual([]);
    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.prices).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("켠 뒤에는 같은 결제용 ID로 다시 켜지 않고, 다른 결제용 ID가 오면 그 ID로 로그인하고 기록을 바꾼다", async () => {
    setPointsChargeAdapter(adapter);
    await pointsChargePrices(["points_1000"], APP_USER_ID);
    await purchasePointsCharge("points_1000", APP_USER_ID);
    expect(adapter.start).toHaveBeenCalledTimes(1);
    expect(adapter.logIn).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);

    await purchasePointsCharge("points_1000", OTHER_APP_USER_ID);
    expect(adapter.logIn).toHaveBeenCalledWith(OTHER_APP_USER_ID);
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
      RECORD_KEY,
      OTHER_APP_USER_ID,
      expect.anything(),
    );
  });

  it("켠 기록이 있으면 앱을 시작할 때 그 결제용 ID로 바로 켠다", async () => {
    setPointsChargeAdapter(adapter);
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(APP_USER_ID);

    await resumePointsCharge();

    expect(adapter.start).toHaveBeenCalledWith(APP_USER_ID);
    // 이어서 같은 ID로 결제하면 다시 켜거나 로그인하지 않는다.
    await purchasePointsCharge("points_1000", APP_USER_ID);
    expect(adapter.start).toHaveBeenCalledTimes(1);
    expect(adapter.logIn).not.toHaveBeenCalled();
  });

  it("켠 기록이 없거나 읽지 못하면 앱을 시작할 때 켜지 않는다", async () => {
    setPointsChargeAdapter(adapter);
    await resumePointsCharge();
    jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("keychain"));
    await resumePointsCharge();

    expect(adapter.start).not.toHaveBeenCalled();
  });

  it("결제를 할 수 없는 바이너리는 기록을 읽지 않는다", async () => {
    await resumePointsCharge();

    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("로그아웃하면 켠 기록을 삭제해 다음 시작에 켜지 않게 한다", async () => {
    setPointsChargeAdapter(adapter);
    await pointsChargePrices(["points_1000"], APP_USER_ID);

    await forgetPointsChargeUser();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(RECORD_KEY, expect.anything());
  });
});

describe("포인트 충전 결제", () => {
  it("어댑터가 없으면 지원하지 않고 결제는 실패, 가격은 빈 목록이다", async () => {
    expect(isPointsChargeSupported()).toBe(false);
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("failed");
    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual([]);
  });

  it("결제 전에 웹이 넘긴 결제용 ID로 결제 SDK를 켠다", async () => {
    setPointsChargeAdapter(adapter);
    const order: string[] = [];
    adapter.start.mockImplementation((id: string) => void order.push(`start:${id}`));
    adapter.purchase.mockImplementation(async (id: string) => {
      order.push(`purchase:${id}`);
      return true;
    });

    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("completed");
    expect(order).toEqual([`start:${APP_USER_ID}`, "purchase:points_1000"]);
  });

  it("결제 SDK를 켜거나 다른 결제용 ID로 로그인하지 못하면 결제하지 않는다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.start.mockImplementationOnce(() => {
      throw new Error("native");
    });
    expect(await purchasePointsCharge("points_1000", APP_USER_ID)).toBe("failed");
    expect(adapter.purchase).not.toHaveBeenCalled();

    await purchasePointsCharge("points_1000", APP_USER_ID);
    adapter.purchase.mockClear();
    adapter.logIn.mockRejectedValue(new Error("network"));
    expect(await purchasePointsCharge("points_1000", OTHER_APP_USER_ID)).toBe("failed");
    expect(adapter.purchase).not.toHaveBeenCalled();
  });

  it("결제용 ID가 없으면 회원번호로 대신 로그인하지 않고 결제하지 않는다", async () => {
    setPointsChargeAdapter(adapter);

    expect(await purchasePointsCharge("points_1000", null)).toBe("failed");
    expect(adapter.start).not.toHaveBeenCalled();
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

  it("가격을 묻기 전에 결제용 ID로 결제 SDK를 켠다", async () => {
    setPointsChargeAdapter(adapter);
    const prices = [{ storeProductId: "points_1000", priceLabel: "₩1,100" }];
    const order: string[] = [];
    adapter.start.mockImplementation((id: string) => void order.push(`start:${id}`));
    adapter.prices.mockImplementation(async () => {
      order.push("prices");
      return prices;
    });

    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual(prices);
    expect(order).toEqual([`start:${APP_USER_ID}`, "prices"]);
  });

  it("켜 둔 뒤 다른 결제용 ID로 로그인하지 못해도 가격은 돌려주고, 켜지 못했으면 빈 목록이다", async () => {
    setPointsChargeAdapter(adapter);
    const prices = [{ storeProductId: "points_1000", priceLabel: "₩1,100" }];
    adapter.prices.mockResolvedValue(prices);
    adapter.start.mockImplementationOnce(() => {
      throw new Error("native");
    });
    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual([]);

    await pointsChargePrices(["points_1000"], APP_USER_ID);
    adapter.logIn.mockRejectedValue(new Error("network"));
    expect(await pointsChargePrices(["points_1000"], OTHER_APP_USER_ID)).toEqual(prices);
  });

  it("가격 조회가 실패하면 빈 목록이다", async () => {
    setPointsChargeAdapter(adapter);
    adapter.prices.mockRejectedValue(new Error("store"));
    expect(await pointsChargePrices(["points_1000"], APP_USER_ID)).toEqual([]);
  });
});

describe("결제 오류 로그", () => {
  it("결제 SDK 오류는 객체를 통째로 남기지 않고 코드나 이름만 남긴다", async () => {
    setPointsChargeAdapter(adapter);
    const warn = jest.mocked(console.warn);
    const rcError = Object.assign(new Error(`purchase failed for ${APP_USER_ID}`), { code: "2" });
    adapter.purchase.mockRejectedValueOnce(rcError);
    adapter.restore.mockRejectedValueOnce(new TypeError(`restore failed for ${APP_USER_ID}`));
    adapter.prices.mockRejectedValueOnce({ message: APP_USER_ID });

    await purchasePointsCharge("points_1000", APP_USER_ID);
    await restorePointsPurchases(["set_book_bear"], APP_USER_ID);
    await pointsChargePrices(["points_1000"], APP_USER_ID);

    expect(warn.mock.calls).toEqual([
      ["[points-charge] 결제 실패", "code 2"],
      ["[points-charge] 구매 복원 실패", "TypeError"],
      ["[points-charge] 가격 조회 실패", "unknown"],
    ]);
  });
});

describe("구매 복원", () => {
  it("어댑터가 없으면 실패로 답한다", async () => {
    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("failed");
  });

  it("결제용 ID로 결제 SDK를 켠 뒤 복원하고, 되찾을 상품이 결제 기록에 있으면 되찾았다고 답한다", async () => {
    setPointsChargeAdapter(adapter);
    const order: string[] = [];
    adapter.start.mockImplementation((id: string) => void order.push(`start:${id}`));
    adapter.restore.mockImplementation(async () => {
      order.push("restore");
      return ["points_1000", "set_book_bear"];
    });

    expect(await restorePointsPurchases(["set_book_bear", "set_book_rain"], APP_USER_ID)).toBe(
      "restored",
    );
    expect(order).toEqual([`start:${APP_USER_ID}`, "restore"]);
  });

  it("결제 기록에 되찾을 상품이 없으면 없다고 답한다", async () => {
    setPointsChargeAdapter(adapter);
    // 충전 묶음은 써서 없어지는 상품이라 결제 기록에 있어도 되찾을 것으로 세지 않는다.
    adapter.restore.mockResolvedValue(["points_1000"]);

    expect(await restorePointsPurchases(["set_book_bear"], APP_USER_ID)).toBe("nothing");
  });

  it("결제용 ID가 없거나 결제 SDK를 켜지 못하거나 복원이 실패하면 실패로 답한다", async () => {
    setPointsChargeAdapter(adapter);
    expect(await restorePointsPurchases(["set_book_bear"], null)).toBe("failed");
    expect(adapter.start).not.toHaveBeenCalled();
    expect(adapter.restore).not.toHaveBeenCalled();

    adapter.start.mockImplementationOnce(() => {
      throw new Error("native");
    });
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
    // 웹도 같은 상한으로 잘라 보내므로 상한까지는 받고 넘으면 버린다.
    const ids = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`);
    expect(
      parse({ ...prices, storeProductIds: ids(POINTS_CHARGE_PRICES_MAX_PRODUCTS) }),
    ).not.toBeNull();
    expect(
      parse({ ...prices, storeProductIds: ids(POINTS_CHARGE_PRICES_MAX_PRODUCTS + 1) }),
    ).toBeNull();
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
