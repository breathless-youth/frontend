import { describe, expect, it } from "vitest";

import { createFakePointsGateway } from "../createFakePointsGateway";

const CROWN = "acc-stopwatch-crown";

async function item(gateway: ReturnType<typeof createFakePointsGateway>, id: string) {
  return (await gateway.getShop()).items.find((it) => it.id === id);
}

describe("createFakePointsGateway 구매", () => {
  it("잔액 1240에서 600짜리를 사면 640이 남고 그 상품을 갖는다", async () => {
    const gateway = createFakePointsGateway("default");
    expect(await gateway.getBalance()).toBe(1240);
    expect(await gateway.purchase(CROWN)).toEqual({ ok: true, balance: 640 });
    expect(await gateway.getBalance()).toBe(640);
    expect((await item(gateway, CROWN))?.owned).toBe(true);
  });

  it("잔액이 모자라면 사지 않는다", async () => {
    const gateway = createFakePointsGateway("default", { balance: 480 });
    expect(await gateway.purchase(CROWN)).toEqual({ ok: false, reason: "insufficient" });
    expect(await gateway.getBalance()).toBe(480);
    expect((await item(gateway, CROWN))?.owned).toBe(false);
  });

  it("잔액이 가격과 같으면 사고 0이 남는다", async () => {
    const gateway = createFakePointsGateway("default", { balance: 600 });
    expect(await gateway.purchase(CROWN)).toEqual({ ok: true, balance: 0 });
  });

  it("가진 상품은 다시 사지 않는다", async () => {
    const gateway = createFakePointsGateway("default");
    await gateway.purchase(CROWN);
    expect(await gateway.purchase(CROWN)).toEqual({ ok: false, reason: "owned" });
    expect(await gateway.getBalance()).toBe(640);
  });

  it("잠긴 마스코트의 소품은 사지 않는다", async () => {
    const gateway = createFakePointsGateway("default");
    const lampItem = (await gateway.getShop()).items.find((it) => it.mascotId === "lamp");
    expect(lampItem).toBeDefined();
    expect(await gateway.purchase(lampItem!.id)).toEqual({ ok: false, reason: "lockedMascot" });
  });

  it("산 내역이 쓴 기록에 남는다", async () => {
    const gateway = createFakePointsGateway("empty");
    expect(await gateway.getHistory("all", null)).toEqual({ entries: [], nextCursor: null });
    const cheap = createFakePointsGateway("default");
    await cheap.purchase(CROWN);
    const spent = (await cheap.getHistory("spent", null)).entries;
    expect(spent[0]).toMatchObject({ amount: -600, reason: "purchase", itemName: "왕관" });
    expect(spent.every((entry) => entry.amount < 0)).toBe(true);
  });
});

describe("createFakePointsGateway 기록 쪽", () => {
  it("커서로 이어 받고 마지막 쪽은 nextCursor가 null이다", async () => {
    const gateway = createFakePointsGateway("default");
    const first = await gateway.getHistory("all", null);
    expect(first.entries).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();
    const second = await gateway.getHistory("all", first.nextCursor);
    expect(second).toMatchObject({ nextCursor: null });
    expect([...first.entries, ...second.entries].map((entry) => entry.id)).toHaveLength(8);
  });
});

describe("createFakePointsGateway 받기", () => {
  it("이미 받은 보상을 다시 받으면 granted가 거짓이고 잔액은 그대로다", async () => {
    const gateway = createFakePointsGateway("default");
    expect(await gateway.claim("attendance")).toEqual({
      granted: false,
      points: 0,
      balance: 1240,
    });
  });

  it("메달 포인트를 받으면 잔액이 늘고 새 메달이 없어진다", async () => {
    const gateway = createFakePointsGateway("default");
    expect(await gateway.claim("medals")).toEqual({ granted: true, points: 60, balance: 1300 });
    expect((await gateway.getEarnToday()).medals).toEqual([]);
  });

  it("광고가 없는 장면이면 보상을 주지 않는다", async () => {
    const gateway = createFakePointsGateway("adUnavailable");
    expect(await gateway.watchAd()).toEqual({ status: "unavailable" });
    expect(await gateway.getBalance()).toBe(1240);
  });

  it("충전하면 묶음 포인트와 보너스가 들어온다", async () => {
    const gateway = createFakePointsGateway("default");
    expect(await gateway.charge("points_1200")).toEqual({
      status: "completed",
      granted: 1200,
      bonus: 100,
      balance: 2540,
    });
  });

  it("결제 실패 장면이면 충전하지 않는다", async () => {
    const gateway = createFakePointsGateway("payFail");
    expect(await gateway.charge("points_1200")).toEqual({ status: "failed" });
  });

  it("불러오기 실패 장면이면 조회가 실패한다", async () => {
    const gateway = createFakePointsGateway("loadError");
    await expect(gateway.getShop()).rejects.toThrow();
    await expect(gateway.getBalance()).rejects.toThrow();
  });
});

describe("createFakePointsGateway 마스코트", () => {
  it("연 마스코트로 고른 것을 옮긴다", async () => {
    const gateway = createFakePointsGateway("default");
    await gateway.selectMascot("book");
    const mascots = (await gateway.getShop()).mascots;
    expect(mascots.filter((m) => m.selected).map((m) => m.id)).toEqual(["book"]);
  });

  it("누적 순공과 해금 기준이 시안과 같다", async () => {
    const shop = await createFakePointsGateway("default").getShop();
    expect(shop.totalFocusSec).toBe(25 * 3600 + 48 * 60);
    expect(shop.mascots.map((m) => m.unlockFocusSec / 3600)).toEqual([0, 5, 15, 30, 60, 100, 150]);
  });
});

describe("createFakePointsGateway 꾸미기", () => {
  it("소품은 같은 마스코트·부위에 하나만 입고 null이면 벗는다", async () => {
    const gateway = createFakePointsGateway("default");
    await gateway.purchase(CROWN);
    await gateway.equipAccessory("stopwatch", "head", CROWN);
    expect((await item(gateway, CROWN))?.inUse).toBe(true);
    await gateway.equipAccessory("stopwatch", "head", null);
    expect((await item(gateway, CROWN))?.inUse).toBe(false);
  });

  it("가지지 않은 소품과 배경은 거절한다", async () => {
    const gateway = createFakePointsGateway("default");
    await expect(gateway.equipAccessory("stopwatch", "head", CROWN)).rejects.toThrow();
    await expect(gateway.setTimerBackground("bg-seaside")).rejects.toThrow();
  });

  it("타이머 배경은 하나만 쓰고 null이면 기본 배경으로 돌린다", async () => {
    const gateway = createFakePointsGateway("default");
    await gateway.setTimerBackground("bg-forest-morning");
    expect((await item(gateway, "bg-forest-morning"))?.inUse).toBe(true);
    await gateway.setTimerBackground(null);
    const backgrounds = (await gateway.getShop()).items.filter(
      (it) => it.kind === "timerBackground",
    );
    expect(backgrounds.some((it) => it.inUse)).toBe(false);
  });

  it("새로 열린 마스코트를 본 것으로 적는다", async () => {
    const gateway = createFakePointsGateway("newMascot");
    const before = (await gateway.getShop()).mascots.filter((m) => m.newlyUnlocked);
    expect(before.map((m) => m.id)).toEqual(["planner", "stopwatch"]);
    await gateway.markUnlocksSeen();
    expect((await gateway.getShop()).mascots.some((m) => m.newlyUnlocked)).toBe(false);
  });
});
