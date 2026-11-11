import { describe, expect, it } from "vitest";

import {
  parseMedalLabel,
  toHistoryPage,
  toMascotCode,
  toMascotId,
  toMascots,
  toPurchaseFailure,
  toSessionReward,
  toShopData,
  toShopItem,
} from "../fromApi";
import type {
  MascotResponse,
  PointsHistoryItemResponse,
  ShopItemResponse,
} from "../pointsApiTypes";

function item(overrides: Partial<ShopItemResponse> = {}): ShopItemResponse {
  return {
    id: 7,
    code: "STOPWATCH_CROWN",
    category: "MASCOT_ACCESSORY",
    mascotCode: "STOPWATCH",
    slot: "HEAD",
    tag: null,
    name: "왕관",
    imageUrl: "https://cdn.example/crown.png",
    price: 600,
    owned: false,
    inUse: false,
    unlock: null,
    ...overrides,
  };
}

function mascot(code: string, overrides: Partial<MascotResponse> = {}): MascotResponse {
  return {
    code,
    unlockFocusSec: 0,
    unlocked: true,
    remainingFocusSec: 0,
    selected: false,
    newlyUnlocked: false,
    ...overrides,
  };
}

describe("마스코트 코드", () => {
  it("LOCK은 padlock으로, 나머지는 소문자로 맞추고 되돌릴 수 있다", () => {
    const codes = ["BOOK", "PLANNER", "STOPWATCH", "LAMP", "PENCIL", "LOCK", "CAMCORDER"];
    expect(codes.map(toMascotId)).toEqual([
      "book",
      "planner",
      "stopwatch",
      "lamp",
      "pencil",
      "padlock",
      "camcorder",
    ]);
    expect(codes.map((code) => toMascotCode(toMascotId(code)!))).toEqual(codes);
  });

  it("모르는 마스코트는 버리고 나머지를 넘긴다", () => {
    const mascots = toMascots({
      totalFocusSec: 0,
      selectedMascotCode: "BOOK",
      mascots: [
        mascot("BOOK", { selected: true }),
        mascot("ROBOT"),
        mascot("LOCK", { newlyUnlocked: true }),
      ],
    });
    expect(mascots).toEqual([
      { id: "book", unlockFocusSec: 0, unlocked: true, selected: true, newlyUnlocked: false },
      { id: "padlock", unlockFocusSec: 0, unlocked: true, selected: false, newlyUnlocked: true },
    ]);
  });
});

describe("toShopItem", () => {
  it("소품은 id를 문자열로, 마스코트와 부위를 화면 값으로 바꾼다", () => {
    expect(toShopItem(item({ owned: true, inUse: true }))).toEqual({
      id: "7",
      kind: "accessory",
      name: "왕관",
      imageUrl: "https://cdn.example/crown.png",
      acquire: { type: "price", price: 600 },
      owned: true,
      inUse: true,
      mascotId: "stopwatch",
      slot: "head",
    });
  });

  it.each([
    ["NATURE", "nature"],
    ["STUDY_SPACE", "studySpace"],
    ["NIGHT_SKY", "nightSky"],
    ["SEASON", "season"],
  ])("타이머 배경의 tag %s는 분류 %s다", (tag, category) => {
    expect(
      toShopItem(item({ category: "TIMER_BACKGROUND", mascotCode: null, slot: null, tag })),
    ).toMatchObject({ kind: "timerBackground", category });
  });

  it("모르는 tag나 tag 없는 배경은 분류 없이 남는다", () => {
    expect(
      toShopItem(
        item({ category: "TIMER_BACKGROUND", mascotCode: null, slot: null, tag: "SPACE" }),
      ),
    ).not.toHaveProperty("category");
    expect(
      toShopItem(item({ category: "TIMER_BACKGROUND", mascotCode: null, slot: null })),
    ).not.toHaveProperty("category");
  });

  it("가격이 null이면 조건을 채운 정도로 보이는 보상 상품이다", () => {
    expect(
      toShopItem(
        item({
          price: null,
          unlock: { type: "TOTAL_FOCUS_HOURS", requiredValue: 100, currentValue: 25 },
        }),
      )?.acquire,
    ).toEqual({ type: "reward", condition: "focusHours", current: 25, target: 100 });
    expect(
      toShopItem(
        item({
          price: null,
          owned: true,
          unlock: { type: "STREAK_DAYS", requiredValue: 30, currentValue: 30 },
        }),
      ),
    ).toMatchObject({ owned: true, acquire: { type: "reward", condition: "streakDays" } });
  });

  it.each([
    ["모르는 category", item({ category: "PLANNER_STICKER" })],
    ["모르는 마스코트", item({ mascotCode: "ROBOT" })],
    ["마스코트 없는 소품", item({ mascotCode: null })],
    ["모르는 부위", item({ slot: "TAIL" })],
    ["조건 없는 보상", item({ price: null, unlock: null })],
    [
      "모르는 조건",
      item({ price: null, unlock: { type: "MEDALS", requiredValue: 1, currentValue: 0 } }),
    ],
  ])("%s는 버린다", (_, value) => {
    expect(toShopItem(value)).toBeNull();
  });

  it("상점 데이터는 버린 항목만 빼고 나머지를 그린다", () => {
    const data = toShopData(
      { items: [item(), item({ id: 8, category: "PLANNER_STICKER" }), item({ id: 9 })] },
      { totalFocusSec: 3600, selectedMascotCode: null, mascots: [mascot("BOOK")] },
    );
    expect(data.items.map((it) => it.id)).toEqual(["7", "9"]);
    expect(data.totalFocusSec).toBe(3600);
  });
});

describe("toPurchaseFailure", () => {
  it("구매 거절 코드만 사유로 바꾸고 나머지는 null이다", () => {
    expect(toPurchaseFailure("ITEM_NOT_PURCHASABLE")).toBe("notPurchasable");
    expect(toPurchaseFailure("SHOP_ITEM_NOT_FOUND")).toBe("notFound");
    expect(toPurchaseFailure("MEMBER_ONLY")).toBeNull();
    expect(toPurchaseFailure(undefined)).toBeNull();
  });
});

describe("toSessionReward", () => {
  const base = {
    earnedPoints: 20,
    statDate: "2026-11-12",
    recognizedFocusSec: 7800,
    dailyCapFocusSec: 43200,
  };

  it("다음 마스코트까지 찬 정도를 남은 순공으로 계산한다", () => {
    expect(
      toSessionReward({
        ...base,
        nextMascot: { code: "LAMP", unlockFocusSec: 108000, remainingFocusSec: 27000 },
      }),
    ).toEqual({
      earned: 20,
      todayFocusSec: 7800,
      capSec: 43200,
      nextMascot: { id: "lamp", remainingSec: 27000, progress: 0.75 },
    });
  });

  it("모르는 다음 마스코트는 그 줄만 뺀다", () => {
    expect(
      toSessionReward({
        ...base,
        nextMascot: { code: "ROBOT", unlockFocusSec: 100, remainingFocusSec: 50 },
      }).nextMascot,
    ).toBeNull();
  });
});

function history(overrides: Partial<PointsHistoryItemResponse>): PointsHistoryItemResponse {
  return {
    id: 1,
    amount: 10,
    reason: "STUDY",
    fund: "FREE",
    label: null,
    statDate: "2026-11-12",
    createdAt: "2026-11-12T03:00:00Z",
    ...overrides,
  };
}

describe("포인트 기록", () => {
  it("구매는 label을 상품 이름으로, 공부는 사유만 싣고 모르는 사유는 버린다", () => {
    const page = toHistoryPage({
      items: [
        history({ id: 1 }),
        history({ id: 2, amount: -300, reason: "PURCHASE", label: "목도리" }),
        history({ id: 3, reason: "LUCKY_DRAW" }),
        history({ id: 4, amount: -100, reason: "PURCHASE", label: null }),
      ],
      nextCursor: null,
    });
    expect(page.entries).toEqual([
      { id: "1", atMs: Date.parse("2026-11-12T03:00:00Z"), amount: 10, reason: "study" },
      {
        id: "2",
        atMs: Date.parse("2026-11-12T03:00:00Z"),
        amount: -300,
        reason: "purchase",
        itemName: "목도리",
      },
      { id: "4", atMs: Date.parse("2026-11-12T03:00:00Z"), amount: -100, reason: "purchase" },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("메달 기록은 판 키와 순위에서 기간과 순위를 읽는다", () => {
    expect(parseMedalLabel("FOCUS_TIME:DAILY/1")).toEqual({ period: "DAILY", rank: 1 });
    expect(parseMedalLabel("TIME_SLOT:WEEKLY:MORNING/3")).toEqual({ period: "WEEKLY", rank: 3 });
    const [entry] = toHistoryPage({
      items: [history({ reason: "MEDAL", amount: 100, label: "FOCUS_RATE:MONTHLY/2" })],
      nextCursor: "n",
    }).entries;
    expect(entry).toMatchObject({ reason: "medal", medal: { period: "MONTHLY", rank: 2 } });
  });

  it.each([null, "FOCUS_TIME:DAILY/9", "FOCUS_TIME/1", "왕관", "FOCUS_TIME:YEARLY/1"])(
    "메달 문구 %s는 형식을 몰라 기본 문구로 남긴다",
    (label) => {
      expect(parseMedalLabel(label)).toBeNull();
      const [entry] = toHistoryPage({
        items: [history({ reason: "MEDAL", label })],
        nextCursor: null,
      }).entries;
      expect(entry).toMatchObject({ reason: "medal" });
      expect(entry).not.toHaveProperty("medal");
    },
  );
});
