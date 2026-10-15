import type { RankingBoardResponse } from "@focusmakers/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_FOCUS_WEEKLY, FIXTURE_OVERTAKEN } from "@/lib/rankingFixtures";

import { useBoardLive } from "../useBoardLive";

afterEach(() => vi.useRealTimers());

type Props = {
  key: string;
  visible: boolean;
  board: RankingBoardResponse | undefined;
  updatedAt: number;
};

function setup() {
  const initialProps: Props = { key: "k", visible: true, board: undefined, updatedAt: 0 };
  return renderHook((props: Props) => useBoardLive(props), { initialProps });
}

describe("useBoardLive", () => {
  it("내려간 응답을 받으면 ▼N을 4초 동안 준다", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, updatedAt: 1 });

    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, updatedAt: 2 });
    expect(result.current.drop).toBe(3);

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(result.current.drop).toBe(3);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.drop).toBeNull();
  });

  it("판이 바뀌면 ▼N을 버린다", () => {
    const { result, rerender } = setup();
    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, updatedAt: 1 });
    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, updatedAt: 2 });

    rerender({ key: "other", visible: true, board: FIXTURE_OVERTAKEN, updatedAt: 2 });

    expect(result.current).toEqual({ drop: null });
  });
});
