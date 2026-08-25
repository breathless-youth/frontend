import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteCheckpoint, listCheckpoints, saveCheckpoint } from "../sessionCheckpoint";

const record = {
  userId: 7,
  startedAtMs: 1_000,
  lastSeenMs: 61_000,
  studySec: 60,
  focusSec: 55,
  events: [
    {
      status: "PAUSE" as const,
      startedAt: "2026-08-25T00:00:10.000Z",
      endedAt: "2026-08-25T00:00:15.000Z",
    },
  ],
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("sessionCheckpoint", () => {
  it("저장한 레코드를 목록으로 되읽고, 삭제하면 사라진다", () => {
    saveCheckpoint(record);
    saveCheckpoint({ ...record, startedAtMs: 2_000 });

    expect(listCheckpoints()).toEqual(
      expect.arrayContaining([record, { ...record, startedAtMs: 2_000 }]),
    );

    deleteCheckpoint(1_000);
    expect(listCheckpoints()).toEqual([{ ...record, startedAtMs: 2_000 }]);
  });

  it("손상된 JSON·형식이 다른 값은 목록에서 걸러진다", () => {
    localStorage.setItem("focusmakers.pendingSession.v1.3000", "{깨진 json");
    localStorage.setItem("focusmakers.pendingSession.v1.4000", JSON.stringify({ userId: "글자" }));
    localStorage.setItem("무관한키", "1");

    expect(listCheckpoints()).toEqual([]);
  });

  it("키의 시각과 본문 startedAtMs가 다른 레코드는 걸러진다 — 삭제가 엇나가 무한 재제출이 된다", () => {
    localStorage.setItem(
      "focusmakers.pendingSession.v1.1000",
      JSON.stringify({ ...record, startedAtMs: 2_000 }),
    );

    expect(listCheckpoints()).toEqual([]);
  });

  it("숫자 필드가 유한값이 아니면 걸러진다", () => {
    localStorage.setItem(
      "focusmakers.pendingSession.v1.5000",
      JSON.stringify({ ...record, startedAtMs: 5_000, studySec: null }),
    );

    expect(listCheckpoints()).toEqual([]);
  });

  it("storage가 예외를 던져도 조용히 넘어간다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveCheckpoint(record)).not.toThrow();
    expect(listCheckpoints()).toEqual([]);
  });
});
