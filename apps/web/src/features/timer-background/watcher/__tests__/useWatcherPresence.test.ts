import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DistractionTrigger } from "@/features/study-session/sessionState";

import { useWatcherPresence } from "../useWatcherPresence";
import type { WatcherTriggerMs } from "../watcherTrigger";

const TEN_SECONDS: WatcherTriggerMs = {
  AWAY: 10_000,
  PHONE: 10_000,
  DEVICE: 10_000,
  SLEEP: 10_000,
};
const AWAY_LONG: WatcherTriggerMs = { ...TEN_SECONDS, PHONE: 5_000, AWAY: 60_000 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPresence(trigger: DistractionTrigger | null, thresholds = TEN_SECONDS) {
  return renderHook(({ trigger }) => useWatcherPresence(trigger, thresholds), {
    initialProps: { trigger },
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useWatcherPresence", () => {
  it("비집중이 기준 시간만큼 끊기지 않고 이어져야 등장한다", () => {
    const { result } = renderPresence("PHONE");

    advance(9_999);
    expect(result.current.present).toBe(false);

    advance(1);
    expect(result.current.present).toBe(true);
  });

  it("들어온 뒤에는 집중이 3초 이어져야 나간다", () => {
    const { result, rerender } = renderPresence("PHONE");
    advance(10_000);

    rerender({ trigger: null });
    advance(2_999);
    expect(result.current.present).toBe(true);

    advance(1);
    expect(result.current.present).toBe(false);
  });

  it("나가기 전에 다시 비집중이면 그대로 머문다", () => {
    const { result, rerender } = renderPresence("PHONE");
    advance(10_000);

    rerender({ trigger: null });
    advance(2_000);
    rerender({ trigger: "PHONE" });
    expect(result.current.present).toBe(true);
    advance(10_000);

    expect(result.current.present).toBe(true);
  });

  it("중간에 집중으로 돌아오면 처음부터 다시 잰다", () => {
    const { result, rerender } = renderPresence("PHONE");
    advance(8_000);

    rerender({ trigger: null });
    rerender({ trigger: "PHONE" });
    advance(8_000);

    expect(result.current.present).toBe(false);
  });

  it("원인마다 기준 시간이 다르다", () => {
    const phone = renderPresence("PHONE", AWAY_LONG);
    const away = renderPresence("AWAY", AWAY_LONG);

    advance(5_000);
    expect(phone.result.current.present).toBe(true);
    expect(away.result.current.present).toBe(false);

    advance(55_000);
    expect(away.result.current.present).toBe(true);
  });

  it("원인이 바뀌면 비집중이 시작된 때부터 잰 시간을 새 원인의 기준과 비교한다", () => {
    const { result, rerender } = renderPresence("AWAY", AWAY_LONG);
    advance(4_000);

    // 자리 비움 4초 뒤 휴대폰으로 바뀌면 휴대폰 기준 5초까지 1초 남는다.
    rerender({ trigger: "PHONE" });
    advance(999);
    expect(result.current.present).toBe(false);
    advance(1);
    expect(result.current.present).toBe(true);
  });

  it("이미 들어온 뒤에는 원인이 바뀌어도 머문다", () => {
    const { result, rerender } = renderPresence("PHONE", AWAY_LONG);
    advance(5_000);

    rerender({ trigger: "AWAY" });

    expect(result.current.present).toBe(true);
  });

  it("들어오기 7초 전부터 다가오다가, 들어오거나 그 전에 집중하면 멈춘다", () => {
    const { result, rerender } = renderPresence("PHONE");
    advance(2_999);
    expect(result.current.approaching).toBe(false);
    advance(1);
    expect(result.current.approaching).toBe(true);
    advance(7_000);
    expect(result.current).toEqual({ present: true, approaching: false });

    const second = renderPresence("PHONE");
    advance(9_000);
    expect(second.result.current.approaching).toBe(true);
    second.rerender({ trigger: null });
    expect(second.result.current.approaching).toBe(false);
    rerender({ trigger: null });
  });
});
