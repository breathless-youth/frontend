import type { RankingBoardResponse } from "@focusmakers/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_FOCUS_WEEKLY, FIXTURE_OVERTAKEN, FIXTURE_SLOT_DAILY } from "@/lib/rankingFixtures";

import { __resetBoardLiveForTests, useBoardLive } from "../useBoardLive";

afterEach(() => {
  vi.useRealTimers();
  __resetBoardLiveForTests();
});

type Props = {
  key: string;
  visible: boolean;
  board: RankingBoardResponse | undefined;
  fresh: boolean;
};

function setup() {
  const initialProps: Props = { key: "k", visible: true, board: undefined, fresh: false };
  return renderHook((props: Props) => useBoardLive(props), { initialProps });
}

function ranked(rank: number): RankingBoardResponse {
  return { ...FIXTURE_FOCUS_WEEKLY, me: { ...FIXTURE_FOCUS_WEEKLY.me!, rank } };
}

const FOCUS = "FOCUS_TIME:DAILY:-";
const SLOT = "TIME_SLOT:DAILY:AFTERNOON";

describe("useBoardLive", () => {
  it("다른 판을 보고 돌아와도 처음 본 순위와 비교한다", () => {
    const { result, rerender } = setup();
    rerender({ key: FOCUS, visible: true, board: ranked(13), fresh: true });
    rerender({ key: SLOT, visible: true, board: FIXTURE_SLOT_DAILY, fresh: true });

    rerender({ key: FOCUS, visible: true, board: ranked(14), fresh: true });

    expect(result.current.change).toBe(-1);
  });

  it("화면을 닫았다 다시 열어도 같은 문서 안에서는 처음 본 순위와 비교한다", () => {
    const first = setup();
    first.rerender({ key: FOCUS, visible: true, board: ranked(13), fresh: true });
    first.unmount();

    const { result } = renderHook((props: Props) => useBoardLive(props), {
      initialProps: { key: FOCUS, visible: true, board: ranked(14), fresh: true },
    });

    expect(result.current.change).toBe(-1);
  });

  it("연 시점보다 내려간 순위를 시간이 지나도 계속 준다", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, fresh: true });

    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, fresh: true });
    expect(result.current.change).toBe(-3);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.change).toBe(-3);
  });

  it("기준선을 받기 전에는 null이다", () => {
    const { result } = setup();

    expect(result.current).toEqual({ change: null });
  });

  it("판이 바뀌면 그 판을 기준선으로 다시 센다", () => {
    const { result, rerender } = setup();
    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, fresh: true });
    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, fresh: true });

    rerender({ key: "other", visible: true, board: FIXTURE_OVERTAKEN, fresh: true });

    expect(result.current).toEqual({ change: 0 });
  });
  it("폴링이 실패해 받아 둔 판이 신선하지 않아져도 마지막 변동을 그대로 준다", () => {
    const { result, rerender } = setup();
    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, fresh: true });
    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, fresh: true });

    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, fresh: false });

    expect(result.current.change).toBe(-3);
  });

  it("처음 본 판에 내 순위가 없었으면 순위가 처음 생긴 판을 기준선으로 다시 센다", () => {
    const { result, rerender } = setup();
    rerender({
      key: "k",
      visible: true,
      board: { ...FIXTURE_FOCUS_WEEKLY, me: null },
      fresh: true,
    });
    expect(result.current.change).toBeNull();

    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, fresh: true });
    expect(result.current.change).toBe(0);

    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, fresh: true });
    expect(result.current.change).toBe(3);
  });

  it("가려졌다 다시 보여도 처음 본 순위와 비교한다", () => {
    const { result, rerender } = setup();
    rerender({ key: "k", visible: true, board: FIXTURE_FOCUS_WEEKLY, fresh: true });
    rerender({ key: "k", visible: false, board: FIXTURE_FOCUS_WEEKLY, fresh: true });
    rerender({ key: "k", visible: false, board: FIXTURE_OVERTAKEN, fresh: true });

    rerender({ key: "k", visible: true, board: FIXTURE_OVERTAKEN, fresh: true });

    expect(result.current.change).toBe(-3);
  });

  it("가려진 동안 받은 판은 변동을 바꾸지 않고 다시 보일 때 바꾼다", () => {
    const { result, rerender } = setup();
    rerender({ key: FOCUS, visible: true, board: ranked(13), fresh: true });
    expect(result.current.change).toBe(0);

    rerender({ key: FOCUS, visible: false, board: ranked(13), fresh: true });
    rerender({ key: FOCUS, visible: false, board: ranked(14), fresh: true });
    rerender({ key: FOCUS, visible: false, board: ranked(14), fresh: false });
    expect(result.current.change).toBe(0);

    rerender({ key: FOCUS, visible: true, board: ranked(14), fresh: false });
    expect(result.current.change).toBe(-1);
  });

  it("지난 기간 기준선과 새 기간의 오래된 판은 비교하지 않고, 신선한 판이 오면 다시 센다", () => {
    const first = setup();
    first.rerender({ key: FOCUS, visible: true, board: ranked(13), fresh: true });
    first.unmount();
    const nextWeek = { ...ranked(10), periodStart: "2026-10-12" };

    const { result, rerender } = renderHook((props: Props) => useBoardLive(props), {
      initialProps: { key: FOCUS, visible: true, board: nextWeek, fresh: false },
    });
    expect(result.current.change).toBeNull();

    rerender({ key: FOCUS, visible: true, board: nextWeek, fresh: true });
    expect(result.current.change).toBe(0);
  });

  it("시간대 판의 지금 구간이 바뀌면 새 구간에서 처음 본 순위와 비교한다", () => {
    const { result, rerender } = setup();
    rerender({
      key: "TIME_SLOT:DAILY:MORNING",
      visible: true,
      board: FIXTURE_FOCUS_WEEKLY,
      fresh: true,
    });
    rerender({
      key: "TIME_SLOT:DAILY:MORNING",
      visible: true,
      board: FIXTURE_OVERTAKEN,
      fresh: true,
    });

    rerender({
      key: "TIME_SLOT:DAILY:AFTERNOON",
      visible: true,
      board: FIXTURE_OVERTAKEN,
      fresh: true,
    });
    expect(result.current.change).toBe(0);

    rerender({
      key: "TIME_SLOT:DAILY:AFTERNOON",
      visible: true,
      board: FIXTURE_FOCUS_WEEKLY,
      fresh: true,
    });
    expect(result.current.change).toBe(3);
  });
});
