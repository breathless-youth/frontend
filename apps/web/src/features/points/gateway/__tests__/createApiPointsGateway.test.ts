import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

import { createApiPointsGateway } from "../createApiPointsGateway";
import { isMemberOnlyError } from "../memberOnly";
import type { MascotsResponse, ShopItemsResponse } from "../pointsApiTypes";

const fetchMock = vi.fn<typeof fetch>();

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
  it("1단계에 없는 받기·기록·충전·광고는 꺼 두고 부르면 요청 없이 거절한다", async () => {
    const gateway = createApiPointsGateway();
    expect(gateway.capabilities).toEqual({
      earn: false,
      history: false,
      charge: false,
      ads: false,
    });
    await expect(gateway.getEarnToday()).rejects.toThrow();
    await expect(gateway.getHistory("all")).rejects.toThrow();
    await expect(gateway.charge("points_500")).rejects.toThrow();
    await expect(gateway.watchAd()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
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
