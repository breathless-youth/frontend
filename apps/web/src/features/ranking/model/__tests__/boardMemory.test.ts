import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_BOARD_MEMORY,
  activeSelection,
  createMemoryBoardMemoryStore,
  mergeOnFocus,
  readBoardMemory,
  requestBoard,
  requestRecordsPage,
  resetBoardMemoryStore,
  setBoardMemoryStore,
  takeRecordsPageRequest,
  withSelection,
  writeBoardMemory,
} from "../boardMemory";

let store: ReturnType<typeof createMemoryBoardMemoryStore>;

beforeEach(() => {
  store = createMemoryBoardMemoryStore();
  setBoardMemoryStore(store);
});

afterEach(() => {
  resetBoardMemoryStore();
  vi.restoreAllMocks();
});

describe("읽기와 쓰기", () => {
  it("적힌 값이 없으면 랭킹 › 순공 › 주간이다", () => {
    expect(readBoardMemory()).toEqual(DEFAULT_BOARD_MEMORY);
    expect(activeSelection(DEFAULT_BOARD_MEMORY)).toEqual({ type: "FOCUS_TIME", period: "WEEKLY" });
  });

  it("랭킹과 명예의 전당의 마지막 판을 따로 기억한다", () => {
    writeBoardMemory({
      active: "hall",
      ranking: { type: "FOCUS_RATE", period: "MONTHLY" },
      hall: { type: "MAX_STREAK" },
    });

    expect(readBoardMemory()).toEqual({
      active: "hall",
      ranking: { type: "FOCUS_RATE", period: "MONTHLY" },
      hall: { type: "MAX_STREAK" },
    });
  });

  it("시간대 구간은 적지 않아 다시 열면 지금 구간이다", () => {
    writeBoardMemory({
      ...DEFAULT_BOARD_MEMORY,
      ranking: { type: "TIME_SLOT", period: "DAILY", slot: "EVENING" },
    });

    expect(JSON.parse(store.raw!)).toEqual({
      active: "ranking",
      ranking: { type: "TIME_SLOT", period: "DAILY" },
      hall: { type: "TOTAL_TIME" },
    });
    expect(readBoardMemory().ranking).toEqual({ type: "TIME_SLOT", period: "DAILY", slot: null });
  });
});

describe("넘겨주기", () => {
  it("넘겨준 구간은 읽어도 남고, 판을 다시 적으면 지워진다", () => {
    requestBoard({ type: "TIME_SLOT", period: "WEEKLY", slot: "DAWN" });

    const first = readBoardMemory();
    expect(first).toEqual({
      active: "ranking",
      ranking: { type: "TIME_SLOT", period: "WEEKLY", slot: "DAWN" },
      hall: { type: "TOTAL_TIME" },
    });
    expect(readBoardMemory().ranking).toEqual({
      type: "TIME_SLOT",
      period: "WEEKLY",
      slot: "DAWN",
    });

    writeBoardMemory(first);

    expect(readBoardMemory().ranking).toEqual({ type: "TIME_SLOT", period: "WEEKLY", slot: null });
  });

  it("명예의 전당 판을 요청하면 그쪽이 열리고 랭킹 쪽 기억은 남는다", () => {
    writeBoardMemory({ ...DEFAULT_BOARD_MEMORY, ranking: { type: "FOCUS_TIME", period: "DAILY" } });

    requestBoard({ type: "TOTAL_DAYS" });

    expect(readBoardMemory()).toEqual({
      active: "hall",
      ranking: { type: "FOCUS_TIME", period: "DAILY" },
      hall: { type: "TOTAL_DAYS" },
    });
  });
});

describe("깨진 값과 없는 조합은 기본 판", () => {
  it.each([
    ["{not json"],
    ['{"active":"ranking","ranking":{"type":"FOCUS_RATE","period":"DAILY"}}'],
    ['{"active":"hall","hall":{"type":"FOCUS_TIME","period":"WEEKLY"}}'],
    ['{"active":"ranking","ranking":{"type":"UNKNOWN"}}'],
    ["null"],
  ])("%s", (raw) => {
    setBoardMemoryStore(createMemoryBoardMemoryStore(raw));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const memory = readBoardMemory();

    expect(memory.ranking).toEqual(DEFAULT_BOARD_MEMORY.ranking);
    expect(memory.hall).toEqual(DEFAULT_BOARD_MEMORY.hall);
  });

  it("저장소를 읽지 못하면 기본 판, 쓰지 못해도 throw하지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setBoardMemoryStore({
      read: () => {
        throw new Error("blocked");
      },
      write: () => {
        throw new Error("blocked");
      },
    });

    expect(readBoardMemory()).toEqual(DEFAULT_BOARD_MEMORY);
    expect(() => writeBoardMemory(DEFAULT_BOARD_MEMORY)).not.toThrow();
    expect(() => requestBoard({ type: "TOTAL_TIME" })).not.toThrow();
  });
});

describe("판 바꾸기와 포커스 복귀", () => {
  it("판을 고르면 그 판의 쪽이 활성이 된다", () => {
    expect(withSelection(DEFAULT_BOARD_MEMORY, { type: "MAX_STREAK" })).toEqual({
      active: "hall",
      ranking: DEFAULT_BOARD_MEMORY.ranking,
      hall: { type: "MAX_STREAK" },
    });
  });

  it("저장된 값에 구간이 없으면 지금 고른 구간을 그대로 둔다", () => {
    const current = withSelection(DEFAULT_BOARD_MEMORY, {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "EVENING",
    });
    const stored = withSelection(DEFAULT_BOARD_MEMORY, {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: null,
    });

    expect(mergeOnFocus(current, stored)).toBe(current);
  });

  it("다른 화면이 다른 판을 적었으면 그 판으로 바꾼다", () => {
    const stored = withSelection(DEFAULT_BOARD_MEMORY, {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "DAWN",
    });

    expect(mergeOnFocus(DEFAULT_BOARD_MEMORY, stored)).toEqual(stored);
  });
});

describe("모두 보기 요청", () => {
  it("한 번만 꺼내고 판 기억과 넘겨준 구간은 남긴다", () => {
    requestBoard({ type: "TIME_SLOT", period: "DAILY", slot: "EVENING" });
    requestRecordsPage(1_000);

    expect(takeRecordsPageRequest(2_000)).toBe(true);
    expect(takeRecordsPageRequest(2_000)).toBe(false);
    expect(readBoardMemory().ranking).toEqual({
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "EVENING",
    });
  });

  it("1분이 지난 요청은 열지 않고 지운다", () => {
    requestRecordsPage(0);

    expect(takeRecordsPageRequest(60_001)).toBe(false);
    expect(JSON.parse(store.raw!)).not.toHaveProperty("requestedRecordsAt");
  });

  it("판 기억을 다시 적으면 요청도 지워진다", () => {
    requestRecordsPage(0);

    writeBoardMemory(readBoardMemory());

    expect(takeRecordsPageRequest(0)).toBe(false);
  });

  it("저장소를 읽지 못하면 요청이 없는 것으로 보고 throw하지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setBoardMemoryStore({
      read: () => {
        throw new Error("blocked");
      },
      write: () => {
        throw new Error("blocked");
      },
    });

    expect(() => requestRecordsPage()).not.toThrow();
    expect(takeRecordsPageRequest()).toBe(false);
  });
});
