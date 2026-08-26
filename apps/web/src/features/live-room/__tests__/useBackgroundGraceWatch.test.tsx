import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockSystemPauseSource } from "@/features/study-session/adapters/systemPauseSource";

import { useBackgroundGraceWatch } from "../useBackgroundGraceWatch";

function setup({ enabled = true, graceMs = 30_000 } = {}) {
  const systemPause = createMockSystemPauseSource();
  const onExpire = vi.fn();
  let nowMs = 1_000_000;
  const hook = renderHook(
    (props: { enabled: boolean }) =>
      useBackgroundGraceWatch({
        enabled: props.enabled,
        onExpire,
        systemPause,
        graceMs,
        now: () => nowMs,
      }),
    { initialProps: { enabled } },
  );
  return { systemPause, onExpire, hook, advance: (ms: number) => (nowMs += ms) };
}

describe("useBackgroundGraceWatch", () => {
  it("숨은 시간이 유예 이상이면 복귀 시 만료 콜백을 1회 부른다", () => {
    const t = setup();
    t.systemPause.leave();
    t.advance(30_000);
    t.systemPause.return();
    expect(t.onExpire).toHaveBeenCalledTimes(1);
  });

  it("유예 미만 복귀는 발화하지 않고, 다음 구간을 새로 잰다", () => {
    const t = setup();
    t.systemPause.leave();
    t.advance(29_999);
    t.systemPause.return();
    expect(t.onExpire).not.toHaveBeenCalled();
    t.systemPause.leave();
    t.advance(30_000);
    t.systemPause.return();
    expect(t.onExpire).toHaveBeenCalledTimes(1);
  });

  it("onLeave가 겹쳐 와도(visibilitychange+pagehide) 첫 시각을 유지한다", () => {
    const t = setup();
    t.systemPause.leave();
    t.advance(20_000);
    t.systemPause.leave();
    t.advance(10_000);
    t.systemPause.return();
    expect(t.onExpire).toHaveBeenCalledTimes(1);
  });

  it("세션이 끝나 감시가 풀려도 숨김 시작 시각을 기억해 isExpiredNow로 판정한다", () => {
    const t = setup();
    t.systemPause.leave();
    t.advance(31_000);
    // 숨어 있는 동안 다른 감시자가 세션을 끝내면 enabled가 꺼지고 구독이 풀린다 —
    // 그래도 이동 시점 판정은 만료로 나와야 한다.
    t.hook.rerender({ enabled: false });
    expect(t.hook.result.current.isExpiredNow()).toBe(true);
  });

  it("복귀로 구간이 닫히면 isExpiredNow는 만료가 아니라고 판정한다", () => {
    const t = setup();
    t.systemPause.leave();
    t.advance(31_000);
    t.systemPause.return();
    expect(t.hook.result.current.isExpiredNow()).toBe(false);
  });

  it("enabled가 아니면 감시하지 않는다", () => {
    const t = setup({ enabled: false });
    t.systemPause.leave();
    t.advance(60_000);
    t.systemPause.return();
    expect(t.onExpire).not.toHaveBeenCalled();
  });
});
