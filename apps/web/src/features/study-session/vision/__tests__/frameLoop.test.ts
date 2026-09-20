import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFrameLoop, nextFrameIntervalMs } from "../frameLoop";
import { FRAME_INTERVAL_MS } from "../visionConfig";

/** 수동으로 해결할 수 있는 promise — "추론이 주기보다 오래 걸린다"를 재현하는 데 쓴다. */
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nextFrameIntervalMs", () => {
  it("지금은 모든 phase에서 상수를 돌려준다 (M1에서 적응형으로 교체)", () => {
    expect(nextFrameIntervalMs("FOCUS")).toBe(FRAME_INTERVAL_MS);
    expect(nextFrameIntervalMs("DISTRACTION")).toBe(FRAME_INTERVAL_MS);
    expect(nextFrameIntervalMs("PAUSE")).toBe(FRAME_INTERVAL_MS);
  });
});

describe("createFrameLoop", () => {
  it("start가 첫 프레임을 즉시 처리하고 그 뒤 고정 주기로 돈다", async () => {
    const onFrame = vi.fn();
    const loop = createFrameLoop({ onFrame });

    loop.start();
    expect(onFrame).toHaveBeenCalledTimes(1); // 세션 시작 직후 200ms 공백을 만들지 않는다
    expect(loop.isRunning).toBe(true);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(onFrame).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(onFrame).toHaveBeenCalledTimes(5);
  });

  it("주기 직전에는 다음 프레임이 아직 오지 않는다", async () => {
    const onFrame = vi.fn();
    const loop = createFrameLoop({ onFrame });

    loop.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS - 1);

    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  // 이 저장소에서 setInterval을 쓰지 않는 이유가 이 테스트다.
  it("추론이 주기보다 오래 걸리면 그 사이 프레임을 건너뛰고 호출이 겹치지 않는다", async () => {
    const first = deferred();
    const onFrame = vi.fn(() => first.promise);
    const loop = createFrameLoop({ onFrame });

    loop.start();
    expect(onFrame).toHaveBeenCalledTimes(1);

    // 주기 3번이 지나도록 첫 추론이 끝나지 않는다 → 추가 호출이 없어야 한다.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(onFrame).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onFrame).toHaveBeenCalledTimes(1); // 밀린 프레임을 몰아서 처리하지 않는다

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it("stop 이후에는 호출되지 않는다", async () => {
    const onFrame = vi.fn();
    const loop = createFrameLoop({ onFrame });

    loop.start();
    loop.stop();

    expect(loop.isRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 10);
    expect(onFrame).toHaveBeenCalledTimes(1); // start 시점의 첫 프레임 하나뿐
  });

  it("추론이 진행 중일 때 stop해도 뒤늦은 완료가 루프를 되살리지 않는다", async () => {
    const pending = deferred();
    const onFrame = vi.fn(() => pending.promise);
    const loop = createFrameLoop({ onFrame });

    loop.start();
    loop.stop();
    pending.resolve();

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 5);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  // React 19 StrictMode가 effect를 두 번 실행한다(devMockDetector.ts 주석 참고).
  it("start를 두 번 불러도 타이머가 두 벌 돌지 않는다", async () => {
    const onFrame = vi.fn();
    const loop = createFrameLoop({ onFrame });

    loop.start();
    loop.start();
    expect(onFrame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 3);
    expect(onFrame).toHaveBeenCalledTimes(4); // 두 벌이면 7이 된다
  });

  it("stop을 두 번 불러도 안전하고, stop 뒤 start로 다시 돌 수 있다", async () => {
    const onFrame = vi.fn();
    const loop = createFrameLoop({ onFrame });

    loop.start();
    loop.stop();
    loop.stop();
    onFrame.mockClear();

    loop.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });

  it("onFrame이 던져도 루프가 멈추지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onFrame = vi.fn(() => {
      throw new Error("detector exploded");
    });
    const loop = createFrameLoop({ onFrame });

    loop.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);

    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("onFrame이 거부(reject)해도 busy가 풀려 다음 프레임이 돈다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onFrame = vi.fn(() => Promise.reject(new Error("inference failed")));
    const loop = createFrameLoop({ onFrame });

    loop.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);

    expect(onFrame).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("앞 프레임이 안 끝나 건너뛴 틱을 알린다", async () => {
    const onDrop = vi.fn();
    const pending = deferred();
    const loop = createFrameLoop({ onFrame: () => pending.promise, onDrop });

    loop.start();
    // 첫 프레임이 아직 안 끝난 채로 다음 두 틱이 지나간다.
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);

    expect(onDrop).toHaveBeenCalledTimes(2);
    pending.resolve();
    loop.stop();
  });

  /**
   * `stop()`이 `busy`를 내리고 세대를 올리므로, 뒤늦게 끝난 옛 추론은 새 세대의 상태를 건드리지
   * 못한다. 재개 직후의 첫 틱은 버림이 아니다 — 버린 틱이 합격 기준이라 이 성질을 고정한다.
   */
  it("추론이 떠 있는 채로 stop 후 start해도 버린 틱으로 세지 않는다", async () => {
    const onDrop = vi.fn();
    const pending = deferred();
    const loop = createFrameLoop({ onFrame: () => pending.promise, onDrop });

    loop.start();
    loop.stop();
    loop.start();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(onDrop).not.toHaveBeenCalled();
    loop.stop();
  });

  it("정상 속도면 알리지 않는다", async () => {
    const onDrop = vi.fn();
    const loop = createFrameLoop({ onFrame: () => {}, onDrop });

    loop.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 4);

    expect(onDrop).not.toHaveBeenCalled();
    loop.stop();
  });

  it("phase를 매 프레임 다시 읽는다 — 적응형 주기로 바꿀 자리", async () => {
    const phase = vi.fn(() => "FOCUS" as const);
    const loop = createFrameLoop({ onFrame: () => {}, phase });

    loop.start();
    await vi.advanceTimersByTimeAsync(FRAME_INTERVAL_MS * 2);
    loop.stop();

    expect(phase.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
