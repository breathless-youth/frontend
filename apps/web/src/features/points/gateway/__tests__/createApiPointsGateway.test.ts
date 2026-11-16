import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { createApiPointsGateway } from "../createApiPointsGateway";
import { isMemberOnlyError } from "../memberOnly";
import type { MascotsResponse, ShopItemsResponse } from "../pointsApiTypes";

const fetchMock = vi.fn<typeof fetch>();
// 서버가 회원에게 주는 결제용 ID이며 회원번호와 다른 값이다.
const APP_USER_ID = "0b9f6a3e-6c1d-4d2a-9a51-3f1c2b7e8d90";

const native = vi.hoisted(() => ({
  isNativePointsChargeAvailable: vi.fn(() => false),
  isNativePointsRestoreAvailable: vi.fn(() => false),
  requestNativePointsPrices: vi.fn(),
  requestNativePointsPurchase: vi.fn(),
  requestNativePointsRestore: vi.fn(),
}));
vi.mock("@/lib/nativePointsCharge", () => native);

const nativeAds = vi.hoisted(() => ({
  isNativePointsAdsAvailable: vi.fn(() => false),
  requestNativePointsAd: vi.fn(),
}));
vi.mock("@/lib/nativePointsAds", () => nativeAds);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function call(index = 0) {
  const [input, init] = fetchMock.mock.calls[index]!;
  const headers = new Headers(init?.headers);
  return {
    url: String(input),
    method: init?.method,
    version: headers.get("API-Version"),
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
  };
}

const MASCOTS: MascotsResponse = {
  totalFocusSec: 7200,
  selectedMascotCode: "BOOK",
  mascots: [
    {
      code: "BOOK",
      unlockFocusSec: 0,
      unlocked: true,
      remainingFocusSec: 0,
      selected: true,
      newlyUnlocked: false,
    },
  ],
};

const ITEMS: ShopItemsResponse = {
  items: [
    {
      id: 31,
      code: "BOOK_SCARF",
      category: "MASCOT_ACCESSORY",
      mascotCode: "BOOK",
      slot: "BODY",
      tag: null,
      name: "목도리",
      imageUrl: null,
      price: 300,
      owned: false,
      inUse: false,
      unlock: null,
    },
  ],
};

describe("createApiPointsGateway", () => {
  it("받기는 켜고 앱 밖에서는 충전과 광고를 꺼 둔다", () => {
    const gateway = createApiPointsGateway();
    expect(gateway.capabilities).toEqual({
      earn: true,
      history: true,
      charge: false,
      ads: false,
      storeItems: false,
      restore: false,
    });
  });

  it("기록은 종류·크기·커서를 실어 GET하고 다음 커서를 넘긴다", async () => {
    fetchMock.mockImplementation(async () =>
      respond(200, {
        items: [
          {
            id: 5,
            amount: -300,
            reason: "PURCHASE",
            fund: "FREE",
            label: "목도리",
            statDate: "2026-11-12",
            createdAt: "2026-11-12T03:00:00Z",
          },
        ],
        nextCursor: 4,
      }),
    );
    const gateway = createApiPointsGateway();
    await expect(gateway.getHistory("spent", null)).resolves.toEqual({
      entries: [
        {
          id: "5",
          atMs: Date.parse("2026-11-12T03:00:00Z"),
          amount: -300,
          reason: "purchase",
          itemName: "목도리",
        },
      ],
      nextCursor: 4,
    });
    await gateway.getHistory("all", 4);
    expect(call(0)).toMatchObject({ method: "GET", version: "1" });
    expect(call(0).url).toMatch(/\/api\/points\/history\?type=SPENT&size=30$/);
    expect(call(1).url).toMatch(/\/api\/points\/history\?type=ALL&size=30&cursor=4$/);
  });

  it("상품과 기록은 화면 언어를 Accept-Language로 보내고 번체는 zh로 보낸다", async () => {
    const { default: i18n } = await import("@/lib/i18n");
    const before = i18n.language;
    await i18n.changeLanguage("zh-Hant");
    try {
      fetchMock.mockImplementation(async (input) =>
        String(input).includes("/api/points/history")
          ? respond(200, { items: [], nextCursor: null })
          : respond(200, { items: [] }),
      );
      const gateway = createApiPointsGateway();
      await gateway.getHistory("all", null);
      expect(
        fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Accept-Language")),
      ).toEqual(["zh"]);
      fetchMock.mockResolvedValue(respond(200, { balance: 0 }));
      await gateway.getBalance();
      expect(new Headers(fetchMock.mock.calls[1]![1]?.headers).get("Accept-Language")).toBeNull();
    } finally {
      await i18n.changeLanguage(before);
    }
  });

  it("잔액을 API-Version 1로 GET한다", async () => {
    fetchMock.mockResolvedValue(respond(200, { balance: 1240 }));
    await expect(createApiPointsGateway().getBalance()).resolves.toBe(1240);
    expect(call()).toMatchObject({ method: "GET", version: "1" });
    expect(call().url).toMatch(/\/api\/points$/);
  });

  it("상점은 상품과 마스코트를 함께 받아 화면 모양으로 넘긴다", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/api/shop/items") ? respond(200, ITEMS) : respond(200, MASCOTS),
    );
    const shop = await createApiPointsGateway().getShop();
    expect(shop.totalFocusSec).toBe(7200);
    expect(shop.mascots.map((m) => m.id)).toEqual(["book"]);
    expect(shop.items).toEqual([
      expect.objectContaining({ id: "31", mascotId: "book", slot: "body" }),
    ]);
    expect(
      fetchMock.mock.calls.map(([input]) => String(input).replace(/^.*\/api/, "/api")).sort(),
    ).toEqual(["/api/mascots", "/api/shop/items"]);
    expect([call(0).version, call(1).version]).toEqual(["1", "1"]);
  });

  it("구매는 숫자 id로 POST하고 돌려받은 잔액을 넘긴다", async () => {
    fetchMock.mockResolvedValue(respond(200, { itemId: 31, balance: 940 }));
    await expect(createApiPointsGateway().purchase("31")).resolves.toEqual({
      ok: true,
      balance: 940,
    });
    expect(call()).toMatchObject({ method: "POST", version: "1" });
    expect(call().url).toMatch(/\/api\/shop\/items\/31\/purchase$/);
  });

  it.each([
    [409, "INSUFFICIENT_POINTS", "insufficient"],
    [409, "ITEM_ALREADY_OWNED", "owned"],
    [409, "MASCOT_LOCKED", "lockedMascot"],
    [409, "ITEM_NOT_PURCHASABLE", "notPurchasable"],
    [404, "SHOP_ITEM_NOT_FOUND", "notFound"],
  ] as const)("구매가 %i %s면 %s 사유로 끝난다", async (status, code, reason) => {
    fetchMock.mockResolvedValue(respond(status, { code, message: code }));
    await expect(createApiPointsGateway().purchase("31")).resolves.toEqual({ ok: false, reason });
  });

  it("모르는 구매 거절과 서버 오류는 그대로 던진다", async () => {
    fetchMock.mockResolvedValueOnce(respond(409, { code: "SOMETHING_NEW", message: "x" }));
    await expect(createApiPointsGateway().purchase("31")).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(respond(500, {}));
    await expect(createApiPointsGateway().purchase("31")).rejects.toMatchObject({ status: 500 });
  });

  it("비회원 거절은 회원 전용 오류로 던진다", async () => {
    fetchMock.mockResolvedValue(respond(403, { code: "MEMBER_ONLY", message: "member only" }));
    const error = await createApiPointsGateway()
      .getBalance()
      .catch((e: unknown) => e);
    expect(isMemberOnlyError(error)).toBe(true);
  });

  it("소품 착용은 서버 마스코트·부위 코드로 PUT하고 null이면 벗긴다", async () => {
    fetchMock.mockImplementation(async () => respond(200, {}));
    const gateway = createApiPointsGateway();
    await gateway.equipAccessory("padlock", "head", "12");
    await gateway.equipAccessory("book", "face", null);
    expect(call(0)).toMatchObject({
      method: "PUT",
      version: "1",
      body: { slot: "HEAD", itemId: 12 },
    });
    expect(call(0).url).toMatch(/\/api\/decorations\/mascots\/LOCK\/accessories$/);
    expect(call(1).body).toEqual({ slot: "FACE", itemId: null });
    expect(call(1).url).toMatch(/\/mascots\/BOOK\/accessories$/);
  });

  it("가지지 않은 소품을 입히면 거절을 던진다", async () => {
    fetchMock.mockResolvedValue(respond(409, { code: "ITEM_NOT_OWNED", message: "x" }));
    await expect(
      createApiPointsGateway().equipAccessory("book", "head", "1"),
    ).rejects.toMatchObject({
      code: "ITEM_NOT_OWNED",
    });
  });

  it("타이머 배경은 id를, 기본 배경은 null을 PUT한다", async () => {
    fetchMock.mockImplementation(async () => respond(200, {}));
    const gateway = createApiPointsGateway();
    await gateway.setTimerBackground("40");
    await gateway.setTimerBackground(null);
    expect(call(0)).toMatchObject({ method: "PUT", version: "1", body: { itemId: 40 } });
    expect(call(0).url).toMatch(/\/api\/decorations\/timer-background$/);
    expect(call(1).body).toEqual({ itemId: null });
  });

  it("마스코트 선택과 새로 열림 확인을 각 경로로 보낸다", async () => {
    fetchMock.mockImplementation(async () => respond(200, MASCOTS));
    const gateway = createApiPointsGateway();
    await gateway.selectMascot("padlock");
    await gateway.markUnlocksSeen();
    expect(call(0)).toMatchObject({ method: "PUT", version: "1", body: { code: "LOCK" } });
    expect(call(0).url).toMatch(/\/api\/mascots\/selected$/);
    expect(call(1)).toMatchObject({ method: "POST", version: "1" });
    expect(call(1).url).toMatch(/\/api\/mascots\/unlocks\/seen$/);
  });

  it("마스코트 선택 거절은 그대로 던진다", async () => {
    fetchMock.mockResolvedValue(respond(409, { code: "MASCOT_LOCKED", message: "x" }));
    await expect(createApiPointsGateway().selectMascot("lamp")).rejects.toMatchObject({
      code: "MASCOT_LOCKED",
    });
  });

  it("공부 끝 보상은 시작 시각을 쿼리로 실어 GET한다", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        earnedPoints: 0,
        statDate: "2026-11-12",
        recognizedFocusSec: 1200,
        dailyCapFocusSec: 43200,
        nextMascot: null,
      }),
    );
    const startedAt = "2026-11-12T09:00:00+09:00";
    await expect(createApiPointsGateway().getSessionReward(startedAt)).resolves.toEqual({
      earned: 0,
      todayFocusSec: 1200,
      capSec: 43200,
      nextMascot: null,
    });
    expect(call()).toMatchObject({ method: "GET", version: "1" });
    expect(call().url).toMatch(
      /\/api\/points\/study-reward\?startedAt=2026-11-12T09%3A00%3A00%2B09%3A00$/,
    );
  });
});

const EARN = {
  date: "2026-11-12",
  todayEarned: 80,
  dailyMax: 254,
  study: {
    recognizedFocusSec: 7800,
    dailyCapFocusSec: 43200,
    unitSec: 1800,
    pointsPerUnit: 10,
    earnedPoints: 40,
    maxPoints: 240,
  },
  attendance: { points: 10, claimed: false },
  dailyGoal: {
    points: 4,
    goalSec: 7200,
    focusSec: 5400,
    remainingSec: 1800,
    achieved: false,
    claimed: false,
  },
  medals: [
    {
      recordId: 301,
      boardKey: "FOCUS_TIME:DAILY",
      period: "DAILY",
      periodStart: "2026-11-09",
      rank: 1,
      points: 100,
    },
  ],
  medalPoints: { daily: [100, 50, 30], weekly: [300, 150, 100], monthly: [1000, 500, 300] },
};

describe("포인트 받기 연결", () => {
  it("받기 탭 데이터를 GET /api/points/earn으로 받아 화면 모양으로 바꾼다", async () => {
    fetchMock.mockResolvedValue(respond(200, EARN));
    const earn = await createApiPointsGateway().getEarnToday();
    expect(call()).toMatchObject({ method: "GET", version: "1" });
    expect(call().url).toMatch(/\/api\/points\/earn$/);
    expect(earn.dailyGoal).toEqual({
      goalSec: 7200,
      reward: 4,
      achieved: false,
      claimed: false,
      remainingSec: 1800,
    });
    expect(earn.ad).toBeUndefined();
    expect(earn.medals).toEqual([{ rank: 1, period: "DAILY", reward: 100 }]);
    expect(earn.medalRates.weekly).toEqual({ gold: 300, silver: 150, bronze: 100 });
    expect(earn.dailyMax).toBe(254);
  });

  it("30분마다 받는 포인트는 오늘 순공 시간이 속한 구간의 값이고, 구간과 같이 한 시간을 함께 넘긴다", async () => {
    const studyTiers = [
      { fromSec: 0, toSec: 7200, soloPoints: 7, togetherPoints: 10 },
      { fromSec: 7200, toSec: 21600, soloPoints: 4, togetherPoints: 5 },
      { fromSec: 21600, toSec: 43200, soloPoints: 1, togetherPoints: 2 },
    ];
    const goalTiers = [
      { fromSec: 0, toSec: 7200, points: 20 },
      { fromSec: 7200, toSec: 28800, points: 5 },
    ];
    fetchMock.mockResolvedValue(
      respond(200, {
        ...EARN,
        study: { ...EARN.study, pointsPerUnit: 7, togetherFocusSec: 3600, tiers: studyTiers },
        dailyGoal: {
          ...EARN.dailyGoal,
          unitSec: 1800,
          pointsPerUnit: 20,
          focusSec: 9000,
          capSec: 28800,
          tiers: goalTiers,
        },
      }),
    );

    const earn = await createApiPointsGateway().getEarnToday();

    // 오늘 순공 2시간 10분은 두 번째 구간이고, 하루 목표는 오늘 순공 2시간 30분이 두 번째 구간이다.
    expect(earn.study).toMatchObject({
      pointsPerUnit: 4,
      togetherFocusSec: 3600,
      tiers: studyTiers,
    });
    expect(earn.dailyGoal).toMatchObject({ pointsPerUnit: 5, capSec: 28800, tiers: goalTiers });
  });

  it("구간을 주지 않는 서버에서는 첫 구간 값인 pointsPerUnit을 그대로 그린다", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { ...EARN, dailyGoal: { ...EARN.dailyGoal, unitSec: 1800, pointsPerUnit: 20 } }),
    );

    const earn = await createApiPointsGateway().getEarnToday();

    expect(earn.study.pointsPerUnit).toBe(10);
    expect(earn.study).not.toHaveProperty("tiers");
    expect(earn.dailyGoal.pointsPerUnit).toBe(20);
  });

  it("목표가 없으면 goalSec와 remainingSec을 null로 두고 메달이 없어도 된다", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        ...EARN,
        dailyGoal: { ...EARN.dailyGoal, points: 0, goalSec: null, remainingSec: null },
        medals: [],
      }),
    );
    const earn = await createApiPointsGateway().getEarnToday();
    expect(earn.dailyGoal).toMatchObject({ goalSec: null, remainingSec: null, reward: 0 });
    expect(earn.medals).toEqual([]);
  });

  it.each([
    ["attendance", "attendance"],
    ["dailyGoal", "daily-goal"],
  ] as const)("%s 받기는 잔액이 응답에 없으면 잔액을 다시 읽는다", async (kind, path) => {
    fetchMock
      .mockResolvedValueOnce(respond(200, { granted: true, points: 10 }))
      .mockResolvedValueOnce(respond(200, { balance: 1250 }));
    const result = await createApiPointsGateway().claim(kind);
    expect(call(0)).toMatchObject({ method: "POST", version: "1" });
    expect(call(0).url).toMatch(new RegExp(`/api/points/rewards/${path}/claim$`));
    expect(result).toEqual({ granted: true, points: 10, balance: 1250 });
  });

  it("메달은 한 번에 받고 받은 개수가 0이면 granted가 거짓이다", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { claimedCount: 2, points: 130, balance: 1370 }));
    const gateway = createApiPointsGateway();
    expect(await gateway.claim("medals")).toEqual({ granted: true, points: 130, balance: 1370 });
    expect(call(0).url).toMatch(/\/api\/points\/rewards\/medals\/claim$/);
    fetchMock.mockResolvedValueOnce(respond(200, { claimedCount: 0, points: 0, balance: 1370 }));
    expect(await gateway.claim("medals")).toMatchObject({ granted: false });
  });

  it.each([
    [409, "REWARD_NOT_AVAILABLE", "dailyGoal"],
    [404, "MEDAL_NOT_FOUND", "medals"],
  ] as const)("%s 응답은 서버 코드를 실은 오류로 던진다", async (status, code, kind) => {
    fetchMock.mockResolvedValue(respond(status, { code, message: "x" }));
    await expect(createApiPointsGateway().claim(kind)).rejects.toMatchObject({ status, code });
  });

  it("네트워크가 끊기면 그대로 거절한다", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(createApiPointsGateway().claim("attendance")).rejects.toThrow();
  });
});

describe("포인트 충전", () => {
  const PRODUCTS = {
    items: [
      { id: 1, storeProductId: "points_1000", points: 1000, bonusPoints: 100, totalPoints: 1100 },
      { id: 2, storeProductId: "points_3000", points: 3000, bonusPoints: 400, totalPoints: 3400 },
    ],
    revenueCatAppUserId: APP_USER_ID,
  };

  afterEach(() => {
    vi.useRealTimers();
    native.isNativePointsChargeAvailable.mockReset().mockReturnValue(false);
    native.requestNativePointsPrices.mockReset();
    native.requestNativePointsPurchase.mockReset();
  });

  function gatewayWith(setup: {
    available?: boolean;
    prices?: { storeProductId: string; priceLabel: string }[];
    purchase?: "completed" | "cancelled" | "failed";
  }) {
    native.isNativePointsChargeAvailable.mockReturnValue(setup.available ?? true);
    native.requestNativePointsPrices.mockResolvedValue(setup.prices ?? []);
    native.requestNativePointsPurchase.mockResolvedValue(setup.purchase ?? "completed");
    return {
      gateway: createApiPointsGateway(),
      requestNativePointsPurchase: native.requestNativePointsPurchase,
    };
  }

  it("결제를 맡을 수 있는 앱에서만 충전을 켠다", async () => {
    expect(gatewayWith({ available: false }).gateway.capabilities.charge).toBe(false);
    expect(gatewayWith({ available: true }).gateway.capabilities.charge).toBe(true);
  });

  it("상품 목록은 서버의 포인트에 스토어 가격을 붙이고 가격을 모르면 null이다", async () => {
    const { gateway } = gatewayWith({
      prices: [{ storeProductId: "points_1000", priceLabel: "₩1,100" }],
    });
    fetchMock.mockResolvedValueOnce(respond(200, PRODUCTS));

    expect(await gateway.getChargePacks()).toEqual([
      { productId: "points_1000", points: 1000, bonus: 100, priceLabel: "₩1,100", popular: false },
      { productId: "points_3000", points: 3000, bonus: 400, priceLabel: null, popular: false },
    ]);
    expect(call().url).toContain("/api/points/products");
    expect(native.requestNativePointsPrices).toHaveBeenCalledWith(
      ["points_1000", "points_3000"],
      APP_USER_ID,
    );
  });

  it("결제가 끝나면 잔액이 늘 때까지 다시 읽어 그 값을 돌려준다", async () => {
    vi.useFakeTimers();
    const { gateway, requestNativePointsPurchase } = gatewayWith({});
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/points/products")) return respond(200, PRODUCTS);
      const balanceReads = fetchMock.mock.calls.filter(
        ([target]) => !String(target).includes("/products"),
      ).length;
      return respond(200, { balance: balanceReads >= 3 ? 1150 : 50 });
    });

    const onPaid = vi.fn();
    const pending = gateway.charge("points_1000", onPaid);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toEqual({
      status: "completed",
      granted: 1000,
      bonus: 100,
      balance: 1150,
    });
    expect(requestNativePointsPurchase).toHaveBeenCalledWith("points_1000", APP_USER_ID);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it("결제가 끝났는데 1분을 기다려도 잔액이 늘지 않으면 늦는 것으로 끝난다", async () => {
    vi.useFakeTimers();
    const { gateway } = gatewayWith({});
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products") ? respond(200, PRODUCTS) : respond(200, { balance: 50 }),
    );

    const onPaid = vi.fn();
    const pending = gateway.charge("points_1000", onPaid);
    await vi.advanceTimersByTimeAsync(61_000);

    expect(await pending).toEqual({ status: "late" });
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it("결제를 취소하면 기다리기 시작했다고 알리지 않는다", async () => {
    const { gateway } = gatewayWith({ purchase: "cancelled" });
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products") ? respond(200, PRODUCTS) : respond(200, { balance: 50 }),
    );
    const onPaid = vi.fn();
    await gateway.charge("points_1000", onPaid);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("취소와 실패는 잔액을 기다리지 않고 그대로 돌려준다", async () => {
    const cancelled = gatewayWith({ purchase: "cancelled" });
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products") ? respond(200, PRODUCTS) : respond(200, { balance: 50 }),
    );
    expect(await cancelled.gateway.charge("points_1000")).toEqual({ status: "cancelled" });

    const failed = gatewayWith({ purchase: "failed" });
    expect(await failed.gateway.charge("points_1000")).toEqual({ status: "failed" });
  });

  it("서버 목록에 없는 상품은 결제를 열지 않는다", async () => {
    const { gateway, requestNativePointsPurchase } = gatewayWith({});
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products") ? respond(200, PRODUCTS) : respond(200, { balance: 50 }),
    );
    expect(await gateway.charge("points_9999")).toEqual({ status: "failed" });
    expect(requestNativePointsPurchase).not.toHaveBeenCalled();
  });

  it("비회원이라 결제용 ID가 null이면 결제를 열지 않고 회원 전용 오류로 던져 로그인 화면으로 보내게 한다", async () => {
    const { gateway, requestNativePointsPurchase } = gatewayWith({});
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products")
        ? respond(200, { ...PRODUCTS, revenueCatAppUserId: null })
        : respond(200, { balance: 50 }),
    );

    const error = await gateway.charge("points_1000").catch((caught: unknown) => caught);
    expect(isMemberOnlyError(error)).toBe(true);
    expect(requestNativePointsPurchase).not.toHaveBeenCalled();
  });

  it("결제용 ID를 받지 못하면 회원번호로 대신하지 않고 결제를 열지 않은 채 거절한다", async () => {
    const { gateway, requestNativePointsPurchase } = gatewayWith({});
    const { revenueCatAppUserId: _omitted, ...withoutId } = PRODUCTS;
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products") ? respond(200, withoutId) : respond(200, { balance: 50 }),
    );
    const missing = await gateway.charge("points_1000").catch((caught: unknown) => caught);
    expect(missing).toBeInstanceOf(Error);
    expect(isMemberOnlyError(missing)).toBe(false);

    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products")
        ? respond(500, { code: "INTERNAL" })
        : respond(200, { balance: 50 }),
    );
    await expect(gateway.charge("points_1000")).rejects.toBeInstanceOf(ApiError);
    expect(requestNativePointsPurchase).not.toHaveBeenCalled();
  });
});

describe("보상형 광고 연결", () => {
  const AD = { available: true, points: 10, watchedToday: 1, dailyLimit: 3 };

  beforeEach(() => {
    nativeAds.isNativePointsAdsAvailable.mockReset().mockReturnValue(true);
    nativeAds.requestNativePointsAd.mockReset().mockResolvedValue("rewarded");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function serve(watchedAfter: (earnReads: number) => number, balance = 60) {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("/api/points/earn")) return respond(200, { balance });
      const earnReads = fetchMock.mock.calls.filter(([target]) =>
        String(target).includes("/api/points/earn"),
      ).length;
      return respond(200, { ...EARN, ad: { ...AD, watchedToday: watchedAfter(earnReads) } });
    });
  }

  it("광고를 맡을 수 있는 앱에서만 광고를 켠다", () => {
    expect(createApiPointsGateway().capabilities.ads).toBe(true);
    nativeAds.isNativePointsAdsAvailable.mockReturnValue(false);
    expect(createApiPointsGateway().capabilities.ads).toBe(false);
  });

  it("서버가 광고를 쓸 수 있다고 할 때만 광고 칸 값을 넘긴다", async () => {
    const gateway = createApiPointsGateway();
    fetchMock.mockResolvedValueOnce(respond(200, { ...EARN, ad: AD }));
    expect((await gateway.getEarnToday()).ad).toEqual({ reward: 10, watched: 1, limit: 3 });

    fetchMock.mockResolvedValueOnce(respond(200, { ...EARN, ad: { ...AD, available: false } }));
    expect((await gateway.getEarnToday()).ad).toBeUndefined();

    fetchMock.mockResolvedValueOnce(respond(200, EARN));
    expect((await gateway.getEarnToday()).ad).toBeUndefined();
  });

  it("광고를 다 보면 오늘 본 횟수가 늘 때까지 다시 읽고 그때의 잔액을 돌려준다", async () => {
    vi.useFakeTimers();
    serve((earnReads) => (earnReads >= 3 ? 2 : 1), 70);

    const pending = createApiPointsGateway().watchAd();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toEqual({ status: "rewarded", balance: 70 });
    expect(nativeAds.requestNativePointsAd).toHaveBeenCalledTimes(1);
  });

  it("기다려도 서버가 시청을 확인하지 못하면 늦는 것으로 끝낸다", async () => {
    vi.useFakeTimers();
    serve(() => 1, 60);

    const pending = createApiPointsGateway().watchAd();
    await vi.advanceTimersByTimeAsync(21_000);

    expect(await pending).toEqual({ status: "late" });
  });

  it("중간에 닫았거나 볼 광고가 없으면 기다리지 않고 그대로 돌려준다", async () => {
    serve(() => 1);
    nativeAds.requestNativePointsAd.mockResolvedValueOnce("cancelled");
    expect(await createApiPointsGateway().watchAd()).toEqual({ status: "cancelled" });

    nativeAds.requestNativePointsAd.mockResolvedValueOnce("unavailable");
    expect(await createApiPointsGateway().watchAd()).toEqual({ status: "unavailable" });
  });
});

describe("createApiPointsGateway 내 모습", () => {
  it("꾸미기 조회에서 고른 마스코트와 그 마스코트의 소품을 읽는다", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, {
        selectedMascotCode: "LAMP",
        accessories: [
          {
            mascotCode: "LAMP",
            slot: "FACE",
            item: { itemId: 3, code: "LAMP_GLASSES", imageUrl: "/glasses.png" },
          },
          {
            mascotCode: "BOOK",
            slot: "HEAD",
            item: { itemId: 4, code: "BOOK_CAP", imageUrl: "/cap.png" },
          },
        ],
        timerBackground: null,
      }),
    );

    const look = await createApiPointsGateway().getMyLook();

    expect(call().url).toContain("/api/decorations");
    expect(call().method).toBe("GET");
    expect(look).toEqual({
      id: "lamp",
      accessories: [{ slot: "face", code: "LAMP_GLASSES", imageUrl: "/glasses.png" }],
    });
  });

  it("고른 마스코트가 없으면 null이다", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, { selectedMascotCode: null, accessories: [], timerBackground: null }),
    );

    expect(await createApiPointsGateway().getMyLook()).toBeNull();
  });
});

describe("구매 복원", () => {
  const STORE_ITEMS: ShopItemsResponse = {
    items: [
      ...ITEMS.items,
      {
        ...ITEMS.items[0]!,
        id: 41,
        code: "BOOK_SET_BEAR",
        slot: "SET",
        price: null,
        storeProductId: "set_book_bear",
      },
      {
        ...ITEMS.items[0]!,
        id: 42,
        code: "BOOK_SET_RAIN",
        slot: "SET",
        price: null,
        storeProductId: "set_book_rain",
      },
    ],
  };

  afterEach(() => {
    native.isNativePointsRestoreAvailable.mockReset().mockReturnValue(false);
    native.requestNativePointsRestore.mockReset();
  });

  it("복원 메시지를 아는 앱에서만 복원을 켠다", () => {
    expect(createApiPointsGateway().capabilities.restore).toBe(false);
    native.isNativePointsRestoreAvailable.mockReturnValue(true);
    expect(createApiPointsGateway().capabilities.restore).toBe(true);
  });

  const routeRestore = (appUserId: string | null) =>
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/api/points/products")
        ? respond(200, { items: [], revenueCatAppUserId: appUserId })
        : respond(200, STORE_ITEMS),
    );

  it.each(["restored", "nothing", "failed"] as const)(
    "스토어 결제로 파는 상품의 ID와 결제용 ID를 앱에 넘기고 앱의 답 %s를 그대로 돌려준다",
    async (status) => {
      native.requestNativePointsRestore.mockResolvedValue(status);
      routeRestore(APP_USER_ID);

      expect(await createApiPointsGateway().restorePurchases()).toBe(status);
      expect(native.requestNativePointsRestore).toHaveBeenCalledWith(
        ["set_book_bear", "set_book_rain"],
        APP_USER_ID,
      );
    },
  );

  it("결제용 ID가 null이면 앱에 묻지 않고 회원 전용 오류로 던진다", async () => {
    routeRestore(null);

    const error = await createApiPointsGateway()
      .restorePurchases()
      .catch((caught: unknown) => caught);
    expect(isMemberOnlyError(error)).toBe(true);
    expect(native.requestNativePointsRestore).not.toHaveBeenCalled();
  });

  it("스토어 결제로 파는 상품이 없으면 앱에 묻지 않고 복원할 것이 없다고 답한다", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, ITEMS));

    expect(await createApiPointsGateway().restorePurchases()).toBe("nothing");
    expect(native.requestNativePointsRestore).not.toHaveBeenCalled();
  });
});

describe("포인트로 여는 마스코트 구매", () => {
  it("서버 마스코트 코드로 POST하고 돌려받은 잔액을 넘긴다", async () => {
    fetchMock.mockResolvedValue(respond(200, { code: "LOCK", balance: 240 }));

    await expect(createApiPointsGateway().purchaseMascot("padlock")).resolves.toEqual({
      ok: true,
      balance: 240,
    });
    expect(call()).toMatchObject({ method: "POST", version: "1" });
    expect(call().url).toMatch(/\/api\/mascots\/LOCK\/purchase$/);
  });

  it.each([
    [409, "INSUFFICIENT_POINTS", "insufficient"],
    [409, "MASCOT_ALREADY_OWNED", "owned"],
    [409, "MASCOT_NOT_PURCHASABLE", "notPurchasable"],
    [404, "MASCOT_NOT_FOUND", "notFound"],
  ] as const)("구매가 %i %s면 %s 사유로 끝난다", async (status, code, reason) => {
    fetchMock.mockResolvedValue(respond(status, { code, message: code }));
    await expect(createApiPointsGateway().purchaseMascot("lamp")).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("모르는 거절은 그대로 던진다", async () => {
    fetchMock.mockResolvedValue(respond(500, { code: "INTERNAL", message: "down" }));
    await expect(createApiPointsGateway().purchaseMascot("lamp")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("스토어 결제 상품", () => {
  const storeItem = (owned: boolean): ShopItemsResponse => ({
    items: [
      {
        ...ITEMS.items[0]!,
        id: 41,
        code: "BOOK_SET_BEAR",
        slot: "SET",
        price: null,
        storeProductId: "set_book_bear",
        owned,
      },
    ],
  });

  afterEach(() => {
    vi.useRealTimers();
    native.requestNativePointsPrices.mockReset();
    native.requestNativePointsPurchase.mockReset();
  });

  const PRODUCTS_WITH_ID = { items: [], revenueCatAppUserId: APP_USER_ID };

  /** 충전 상품 목록은 결제용 ID를 주고 나머지 주소는 상점 목록을 순서대로 준다. */
  function routeStore(shops: ShopItemsResponse[], products: unknown = PRODUCTS_WITH_ID) {
    let shopReads = 0;
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes("/api/points/products")) {
        return respond(200, products);
      }
      const shop = shops[Math.min(shopReads, shops.length - 1)]!;
      shopReads += 1;
      return respond(200, shop);
    });
  }

  it("가격은 앱에 물어 스토어 상품 ID마다 문구로 돌려주고, 물을 상품이 없으면 앱에 묻지 않는다", async () => {
    native.requestNativePointsPrices.mockResolvedValue([
      { storeProductId: "set_book_bear", priceLabel: "₩3,300" },
    ]);
    routeStore([]);
    const gateway = createApiPointsGateway();

    expect(await gateway.getStorePrices([])).toEqual({});
    expect(native.requestNativePointsPrices).not.toHaveBeenCalled();
    expect(await gateway.getStorePrices(["set_book_bear", "set_book_rain"])).toEqual({
      set_book_bear: "₩3,300",
    });
    expect(native.requestNativePointsPrices).toHaveBeenCalledWith(
      ["set_book_bear", "set_book_rain"],
      APP_USER_ID,
    );
  });

  it("결제용 ID를 받지 못해도 가격은 로그인 없이 묻는다", async () => {
    native.requestNativePointsPrices.mockResolvedValue([]);
    fetchMock.mockResolvedValue(respond(500, { code: "INTERNAL" }));

    expect(await createApiPointsGateway().getStorePrices(["set_book_bear"])).toEqual({});
    expect(native.requestNativePointsPrices).toHaveBeenCalledWith(["set_book_bear"], null);
  });

  it("결제가 끝나면 서버가 보유로 바꿀 때까지 상점을 다시 읽는다", async () => {
    vi.useFakeTimers();
    native.requestNativePointsPurchase.mockResolvedValue("completed");
    routeStore([storeItem(false), storeItem(false), storeItem(true)]);
    const onPaid = vi.fn();

    const pending = createApiPointsGateway().purchaseStoreItem("41", onPaid);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toEqual({ status: "completed" });
    expect(native.requestNativePointsPurchase).toHaveBeenCalledWith("set_book_bear", APP_USER_ID);
    expect(onPaid).toHaveBeenCalledOnce();
    // 상점 목록 세 번과 결제용 ID를 받는 충전 상품 목록 한 번이다.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("결제는 끝났는데 1분을 기다려도 보유로 바뀌지 않으면 늦는 것으로 끝난다", async () => {
    vi.useFakeTimers();
    native.requestNativePointsPurchase.mockResolvedValue("completed");
    routeStore([storeItem(false)]);

    const pending = createApiPointsGateway().purchaseStoreItem("41");
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(pending).resolves.toEqual({ status: "late" });
  });

  it.each(["cancelled", "failed"] as const)(
    "결제가 %s로 끝나면 기다리지 않고 그대로 돌려준다",
    async (status) => {
      native.requestNativePointsPurchase.mockResolvedValue(status);
      routeStore([storeItem(false)]);
      const onPaid = vi.fn();

      await expect(createApiPointsGateway().purchaseStoreItem("41", onPaid)).resolves.toEqual({
        status,
      });
      expect(onPaid).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("이미 가졌거나 스토어 결제 상품이 아니거나 없는 상품은 결제를 열지 않는다", async () => {
    fetchMock.mockImplementation(async () =>
      respond(200, { items: [...storeItem(true).items, ...ITEMS.items] }),
    );
    const gateway = createApiPointsGateway();

    await expect(gateway.purchaseStoreItem("41")).resolves.toEqual({ status: "failed" });
    await expect(gateway.purchaseStoreItem("31")).resolves.toEqual({ status: "failed" });
    await expect(gateway.purchaseStoreItem("999")).resolves.toEqual({ status: "failed" });
    expect(native.requestNativePointsPurchase).not.toHaveBeenCalled();
  });

  it("결제용 ID가 null이면 결제를 열지 않고 회원 전용 오류로 던진다", async () => {
    routeStore([storeItem(false)], { items: [], revenueCatAppUserId: null });

    const error = await createApiPointsGateway()
      .purchaseStoreItem("41")
      .catch((caught: unknown) => caught);
    expect(isMemberOnlyError(error)).toBe(true);
    expect(native.requestNativePointsPurchase).not.toHaveBeenCalled();
  });
});
