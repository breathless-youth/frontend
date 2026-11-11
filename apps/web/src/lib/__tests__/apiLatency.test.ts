import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { beginApiLatency, recordApiLatency, resetApiLatencyForTest } from "../apiLatency";

const mocks = vi.hoisted(() => ({ trackApiLatencySampled: vi.fn() }));
vi.mock("@/lib/amplitude", () => ({ trackApiLatencySampled: mocks.trackApiLatencySampled }));

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("API 응답 시간 요약", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetApiLatencyForTest();
    mocks.trackApiLatencySampled.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    visibility = "visible";
  });

  it("10개가 모이면 중간값과 최댓값을 한 번 보낸다", async () => {
    for (let ms = 10; ms <= 100; ms += 10) recordApiLatency(ms);
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledTimes(1);
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledWith({
      medianMs: 55,
      maxMs: 100,
      sampleCount: 10,
    });
  });

  it("10개가 안 돼도 첫 표본 뒤 30초가 지나면 모은 만큼 보낸다", async () => {
    recordApiLatency(30);
    recordApiLatency(10);
    recordApiLatency(20);
    vi.advanceTimersByTime(29_999);
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledWith({
      medianMs: 20,
      maxMs: 30,
      sampleCount: 3,
    });
  });

  it("한 번 보낸 뒤에는 다시 보내지 않는다", async () => {
    for (let i = 0; i < 10; i++) recordApiLatency(50);
    for (let i = 0; i < 10; i++) recordApiLatency(500);
    vi.advanceTimersByTime(60_000);
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledTimes(1);
  });

  it("소수점 응답 시간은 반올림해 보낸다", async () => {
    recordApiLatency(12.4);
    recordApiLatency(80.6);
    vi.advanceTimersByTime(30_000);
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledWith({
      medianMs: 47,
      maxMs: 81,
      sampleCount: 2,
    });
  });

  it("화면이 숨겨지면 30초를 기다리지 않고 모은 만큼 보낸다", async () => {
    recordApiLatency(40);
    recordApiLatency(60);
    setVisibility("hidden");
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledWith({
      medianMs: 50,
      maxMs: 60,
      sampleCount: 2,
    });
  });

  it("요청 도중 화면이 숨겨졌다 돌아오면 그 요청은 표본에서 뺀다", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const suspended = beginApiLatency();
    setVisibility("hidden");
    setVisibility("visible");
    now.mockReturnValue(9_000);
    suspended();
    const normal = beginApiLatency();
    now.mockReturnValue(9_120);
    normal();
    vi.advanceTimersByTime(30_000);
    await vi.dynamicImportSettled();
    expect(mocks.trackApiLatencySampled).toHaveBeenCalledWith({
      medianMs: 120,
      maxMs: 120,
      sampleCount: 1,
    });
    now.mockRestore();
  });
});
