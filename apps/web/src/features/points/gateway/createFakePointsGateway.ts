import { buildPointsFixture, type PointsScene } from "../fixtures";
import type { PointsReason, ShopItem } from "../types";
import { FULL_POINTS_CAPABILITIES, type PointsGateway } from "./PointsGateway";

/**
 * 메모리 가짜 포인트 경계
 *
 * 서버가 하듯 잔액과 보유 상태를 실제로 바꿔서, 산 뒤 다시 받은 조회가 바뀐 값을 돌려준다.
 * 돌려주는 값은 복사본이라 화면이 고쳐도 이 상태가 바뀌지 않는다.
 * `balance`는 시안의 다른 잔액(모자랄 때 등)을 같은 장면에서 그리려고 덮어쓴다.
 */
export function createFakePointsGateway(
  scene: PointsScene,
  overrides: { balance?: number } = {},
): PointsGateway {
  const state = buildPointsFixture(scene);
  state.balance = overrides.balance ?? state.balance;
  let nextHistoryId = 0;

  const read = async <T>(value: () => T): Promise<T> => {
    if (scene === "loadError") {
      throw new Error("fake points load error");
    }
    return structuredClone(value());
  };
  const findItem = (itemId: string): ShopItem => {
    const item = state.items.find((it) => it.id === itemId);
    if (!item) {
      throw new Error(`unknown item ${itemId}`);
    }
    return item;
  };
  const record = (amount: number, reason: PointsReason, itemName?: string) => {
    nextHistoryId += 1;
    state.history.unshift({
      id: `fake-${nextHistoryId}`,
      atMs: Date.now(),
      amount,
      reason,
      ...(itemName === undefined ? {} : { itemName }),
    });
  };
  const earn = (amount: number, reason: PointsReason) => {
    state.balance += amount;
    state.earn.earned += amount;
    record(amount, reason);
  };

  const findOwned = (itemId: string): ShopItem => {
    const item = findItem(itemId);
    if (!item.owned) {
      throw new Error(`item ${itemId} is not owned`);
    }
    return item;
  };

  return {
    capabilities: FULL_POINTS_CAPABILITIES,
    getBalance: () => read(() => state.balance),
    getShop: () =>
      read(() => ({
        items: state.items,
        mascots: state.mascots,
        totalFocusSec: state.totalFocusSec,
      })),
    purchase: async (itemId) => {
      const item = findItem(itemId);
      if (item.owned) {
        return { ok: false, reason: "owned" };
      }
      if (item.acquire.type !== "price") {
        throw new Error(`reward item ${itemId} is not for sale`);
      }
      const mascot = state.mascots.find((m) => m.id === item.mascotId);
      if (mascot && !mascot.unlocked) {
        return { ok: false, reason: "lockedMascot" };
      }
      if (state.balance < item.acquire.price) {
        return { ok: false, reason: "insufficient" };
      }
      state.balance -= item.acquire.price;
      item.owned = true;
      record(-item.acquire.price, "purchase", item.name);
      return { ok: true, balance: state.balance };
    },
    // 같은 자리에는 하나만 쓰므로 먼저 그 자리를 비운다.
    equipAccessory: async (mascotId, slot, itemId) => {
      const item = itemId === null ? null : findOwned(itemId);
      for (const other of state.items) {
        if (other.kind === "accessory" && other.mascotId === mascotId && other.slot === slot) {
          other.inUse = false;
        }
      }
      if (item) item.inUse = true;
    },
    setTimerBackground: async (itemId) => {
      const item = itemId === null ? null : findOwned(itemId);
      for (const other of state.items) {
        if (other.kind === "timerBackground") other.inUse = false;
      }
      if (item) item.inUse = true;
    },
    selectMascot: async (id) => {
      const target = state.mascots.find((m) => m.id === id);
      if (!target?.unlocked) {
        throw new Error(`mascot ${id} is locked`);
      }
      for (const mascot of state.mascots) {
        mascot.selected = mascot.id === id;
      }
    },
    markUnlocksSeen: async () => {
      for (const mascot of state.mascots) {
        mascot.newlyUnlocked = false;
      }
    },
    getHistory: (filter) =>
      read(() =>
        state.history.filter((entry) =>
          filter === "all" ? true : filter === "earned" ? entry.amount > 0 : entry.amount < 0,
        ),
      ),
    getEarnToday: () => read(() => state.earn),
    claim: async (kind) => {
      if (kind === "attendance" && !state.earn.attendance.claimed) {
        state.earn.attendance.claimed = true;
        earn(state.earn.attendance.reward, "attendance");
      } else if (
        kind === "dailyGoal" &&
        state.earn.dailyGoal.achieved &&
        !state.earn.dailyGoal.claimed
      ) {
        state.earn.dailyGoal.claimed = true;
        earn(state.earn.dailyGoal.reward, "dailyGoal");
      } else if (kind === "medals" && state.earn.medals.length > 0) {
        const total = state.earn.medals.reduce((sum, medal) => sum + medal.reward, 0);
        state.earn.medals = [];
        earn(total, "medal");
      }
      return { balance: state.balance };
    },
    watchAd: async () => {
      if (scene === "adUnavailable" || state.earn.ad.watched >= state.earn.ad.limit) {
        return { status: "unavailable" };
      }
      state.earn.ad.watched += 1;
      earn(state.earn.ad.reward, "ad");
      return { status: "rewarded", balance: state.balance };
    },
    getChargePacks: () => read(() => state.packs),
    charge: async (productId) => {
      const pack = state.packs.find((it) => it.productId === productId);
      if (scene === "payFail" || !pack) {
        return { status: "failed" };
      }
      state.balance += pack.points + pack.bonus;
      record(pack.points + pack.bonus, "charge");
      return {
        status: "completed",
        granted: pack.points,
        bonus: pack.bonus,
        balance: state.balance,
      };
    },
    getSessionReward: () => read(() => state.sessionReward),
  };
}
