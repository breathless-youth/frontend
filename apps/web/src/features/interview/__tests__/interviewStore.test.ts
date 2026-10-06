import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INITIAL_INTERVIEW_STATE,
  createMemoryInterviewStore,
  loadInterviewState,
  loadLastHiddenAt,
  localStorageInterviewStore,
  recordLastHiddenAt,
  resetInterviewStore,
  setInterviewStore,
  updateInterviewState,
} from "../interviewStore";

afterEach(() => {
  resetInterviewStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("localStorageInterviewStore", () => {
  it("저장값이 없으면 초기 상태를 읽는다", () => {
    expect(localStorageInterviewStore.read()).toEqual(INITIAL_INTERVIEW_STATE);
  });

  it("쓴 값을 그대로 읽는다", () => {
    const state = { ...INITIAL_INTERVIEW_STATE, modalCount: 1, firstModalAt: 1000 };
    localStorageInterviewStore.write(state);

    expect(localStorage.getItem("focuson.interview.v1")).not.toBeNull();
    expect(localStorageInterviewStore.read()).toEqual(state);
  });

  it("형태가 깨진 값은 필드별로 초기값으로 메운다", () => {
    localStorage.setItem(
      "focuson.interview.v1",
      JSON.stringify({ modalCount: "x", applied: true }),
    );

    expect(localStorageInterviewStore.read()).toEqual({
      ...INITIAL_INTERVIEW_STATE,
      applied: true,
    });
  });

  it("JSON이 아니면 초기 상태를 읽는다", () => {
    localStorage.setItem("focuson.interview.v1", "{");

    expect(localStorageInterviewStore.read()).toEqual(INITIAL_INTERVIEW_STATE);
  });

  it("lastHiddenAt을 숫자로 저장하고 읽는다", () => {
    localStorageInterviewStore.writeLastHiddenAt(1234);

    expect(localStorage.getItem("focuson.interview.lastHiddenAt")).toBe("1234");
    expect(localStorageInterviewStore.readLastHiddenAt()).toBe(1234);
  });

  it("lastHiddenAt이 빈 문자열이면 기록 없음으로 읽는다", () => {
    localStorage.setItem("focuson.interview.lastHiddenAt", "");
    expect(localStorageInterviewStore.readLastHiddenAt()).toBeNull();

    localStorage.setItem("focuson.interview.lastHiddenAt", "  ");
    expect(localStorageInterviewStore.readLastHiddenAt()).toBeNull();
  });
});

describe("최상위 함수", () => {
  it("읽기가 throw하면 loadInterviewState는 null이다", () => {
    setInterviewStore({
      ...createMemoryInterviewStore(),
      read: () => {
        throw new Error("blocked");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(loadInterviewState()).toBeNull();
  });

  it("updateInterviewState는 바꾼 상태를 저장하고 돌려준다", () => {
    const store = createMemoryInterviewStore();
    setInterviewStore(store);

    const next = updateInterviewState((s) => ({ ...s, applied: true }));

    expect(next?.applied).toBe(true);
    expect(store.read().applied).toBe(true);
  });

  it("쓰기가 throw해도 updateInterviewState는 throw하지 않는다", () => {
    setInterviewStore({
      ...createMemoryInterviewStore(),
      write: () => {
        throw new Error("quota");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => updateInterviewState((s) => s)).not.toThrow();
  });

  it("lastHiddenAt 읽기 실패는 null, 쓰기 실패는 무시한다", () => {
    setInterviewStore({
      ...createMemoryInterviewStore(),
      readLastHiddenAt: () => {
        throw new Error("blocked");
      },
      writeLastHiddenAt: () => {
        throw new Error("blocked");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(loadLastHiddenAt()).toBeNull();
    expect(() => recordLastHiddenAt(1)).not.toThrow();
  });
});
