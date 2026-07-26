import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import type { PauseTrigger } from "../sessionState";
import type { SessionTuningConfig } from "../sessionTuning";
import type { PausedSnapshot } from "../usePauseAutoEnd";
import { usePauseAutoEnd } from "../usePauseAutoEnd";

/** 3초 — 테스트에서만 쓰는 짧은 값이다. 프로덕션 기본값은 여전히 미정(null)이다. */
const THREE_SECONDS: SessionTuningConfig = { autoEndPauseMinutes: 0.05 };
const DISABLED: SessionTuningConfig = { autoEndPauseMinutes: null };

interface HarnessProps {
  paused: PausedSnapshot | null;
  config?: SessionTuningConfig;
  now?: () => number;
  systemPause?: ReturnType<typeof createMockSystemPauseSource>;
}

function setup(initialProps: HarnessProps) {
  const onAutoEnd = vi.fn<(trigger: PauseTrigger) => void>();
  const view = renderHook(
    (props: HarnessProps) =>
      usePauseAutoEnd({
        paused: props.paused,
        config: props.config ?? THREE_SECONDS,
        onAutoEnd,
        systemPause: props.systemPause,
        now: props.now,
        pollMs: 100,
      }),
    { initialProps },
  );
  return { onAutoEnd, ...view };
}

describe("usePauseAutoEnd — 일시정지 자동 종료 감시자", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("일시정지가 아니면 아무 일도 하지 않는다", () => {
    vi.useFakeTimers();
    const { onAutoEnd } = setup({ paused: null });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onAutoEnd).not.toHaveBeenCalled();
  });

  it("임계값이 미정(null)이면 감시하지 않는다 — 임의 기본값으로 세션을 끝내지 않는다", () => {
    vi.useFakeTimers();
    const { onAutoEnd } = setup({
      paused: { sinceMs: Date.now(), trigger: "MANUAL" },
      config: DISABLED,
    });

    act(() => {
      vi.advanceTimersByTime(600_000);
    });

    expect(onAutoEnd).not.toHaveBeenCalled();
  });

  it("임계값을 넘기면 자동 종료를 알린다", () => {
    vi.useFakeTimers();
    const { onAutoEnd } = setup({ paused: { sinceMs: Date.now(), trigger: "MANUAL" } });

    act(() => {
      vi.advanceTimersByTime(2_900);
    });
    expect(onAutoEnd).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onAutoEnd).toHaveBeenCalledExactlyOnceWith("MANUAL");
  });

  it("같은 일시정지 구간에서 두 번 발화하지 않는다", () => {
    vi.useFakeTimers();
    const { onAutoEnd } = setup({ paused: { sinceMs: Date.now(), trigger: "MANUAL" } });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onAutoEnd).toHaveBeenCalledTimes(1);
  });

  it("트리거는 임계값 판정에 쓰이지 않는다 — 수동/화면꺼짐이 같은 시점에 종료된다", () => {
    // 2026-07-26 확정: N값은 수동 일시정지·화면 꺼짐 **공용** 파라미터다.
    // 트리거별로 다른 임계값이 생기면 여기서 깨진다.
    vi.useFakeTimers();
    const startMs = Date.now();
    const manual = setup({ paused: { sinceMs: startMs, trigger: "MANUAL" } });
    const background = setup({ paused: { sinceMs: startMs, trigger: "BACKGROUND" } });

    act(() => {
      vi.advanceTimersByTime(2_900);
    });
    expect(manual.onAutoEnd).not.toHaveBeenCalled();
    expect(background.onAutoEnd).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(manual.onAutoEnd).toHaveBeenCalledExactlyOnceWith("MANUAL");
    expect(background.onAutoEnd).toHaveBeenCalledExactlyOnceWith("BACKGROUND");
  });

  it("복귀 시 경과를 다시 계산한다 — 화면 꺼짐 동안 타이머가 멈춰 있어도 종료된다", () => {
    // 화면 꺼짐·백그라운드에서는 WebView가 인터벌을 스로틀링하거나 아예 멈춘다.
    // `setTimeout` 하나에 기대면 여기서 콜백이 영영 오지 않는다 — 그래서 벽시계 경과를
    // 복귀 시점에 재계산한다. 아래는 **인터벌을 한 번도 돌리지 않고** 시계만 앞으로 민다.
    vi.useFakeTimers();
    const systemPause = createMockSystemPauseSource();
    let clockMs = 1_000_000;
    const { onAutoEnd } = setup({
      paused: { sinceMs: clockMs, trigger: "BACKGROUND" },
      now: () => clockMs,
      systemPause,
    });

    clockMs += 120_000;
    expect(onAutoEnd).not.toHaveBeenCalled();

    act(() => {
      systemPause.return();
    });

    expect(onAutoEnd).toHaveBeenCalledExactlyOnceWith("BACKGROUND");
  });

  it("일시정지가 풀리면 감시를 멈추고, 다시 일시정지하면 새 구간으로 다시 잰다", () => {
    vi.useFakeTimers();
    const startMs = Date.now();
    const { onAutoEnd, rerender } = setup({ paused: { sinceMs: startMs, trigger: "MANUAL" } });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender({ paused: null });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onAutoEnd).not.toHaveBeenCalled();

    // 새 일시정지 — 이전 구간의 2초는 이월되지 않는다.
    rerender({ paused: { sinceMs: Date.now(), trigger: "MANUAL" } });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onAutoEnd).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    expect(onAutoEnd).toHaveBeenCalledTimes(1);
  });
});
