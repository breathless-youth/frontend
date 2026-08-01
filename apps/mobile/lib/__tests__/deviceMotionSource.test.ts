import { MOTION_SAMPLE_INTERVAL_MS } from "../deviceMotion";
import type { AccelerometerAdapter } from "../deviceMotionSource";
import { createDeviceMotionSource } from "../deviceMotionSource";

type Measurement = { x: number; y: number; z: number };

function createFakeAccelerometer(available = true) {
  let listener: ((measurement: Measurement) => void) | null = null;
  let removed = 0;
  let interval: number | null = null;

  const adapter: AccelerometerAdapter = {
    setUpdateInterval(intervalMs) {
      interval = intervalMs;
    },
    addListener(next) {
      listener = next;
      return {
        remove() {
          listener = null;
          removed += 1;
        },
      };
    },
    isAvailableAsync() {
      return Promise.resolve(available);
    },
  };

  return {
    adapter,
    get isSubscribed() {
      return listener !== null;
    },
    get removeCount() {
      return removed;
    },
    get interval() {
      return interval;
    },
    emit(measurement: Measurement) {
      listener?.(measurement);
    },
  };
}

/** 20Hz 표본을 n개 밀어 넣는다. */
function emitAll(
  fake: ReturnType<typeof createFakeAccelerometer>,
  measurements: readonly Measurement[],
): void {
  for (const measurement of measurements) {
    fake.emit(measurement);
  }
}

const RESTING: Measurement[] = Array.from({ length: 20 }, (_, index) => ({
  x: 0,
  y: 0,
  z: 1 + (index % 2 === 0 ? 0.002 : -0.002),
}));

const HANDLED: Measurement[] = Array.from({ length: 20 }, (_, index) => ({
  x: index % 2 === 0 ? 0.06 : -0.05,
  y: index % 3 === 0 ? 0.04 : -0.06,
  z: 1 + (index % 2 === 0 ? 0.08 : -0.07),
}));

/** 표본 시각을 20Hz로 진행시킨다 — 실제 구독과 같은 리듬이어야 창 계산이 의미를 갖는다. */
function createClock() {
  let nowMs = 1_000_000;
  return () => {
    nowMs += MOTION_SAMPLE_INTERVAL_MS;
    return nowMs;
  };
}

describe("createDeviceMotionSource", () => {
  it("start()가 가용성 확인 후 20Hz로 구독한다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({ accelerometer: fake.adapter });

    source.start();
    await Promise.resolve();

    expect(fake.isSubscribed).toBe(true);
    expect(fake.interval).toBe(MOTION_SAMPLE_INTERVAL_MS);
  });

  it("센서가 없는 기기에서는 조용히 아무것도 하지 않는다", async () => {
    const fake = createFakeAccelerometer(false);
    const source = createDeviceMotionSource({ accelerometer: fake.adapter });

    source.start();
    await Promise.resolve();

    expect(fake.isSubscribed).toBe(false);
  });

  it("조작이 시작될 때 한 번만 알린다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({
      accelerometer: fake.adapter,
      nowMs: createClock(),
    });
    const seen: boolean[] = [];
    source.subscribe((active) => seen.push(active));

    source.start();
    await Promise.resolve();
    emitAll(fake, HANDLED);

    // 표본마다 통지하지 않는다 — 값이 바뀌는 순간에만 간다.
    expect(seen).toEqual([true]);
  });

  it("거치 상태에서는 아무 신호도 보내지 않는다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({
      accelerometer: fake.adapter,
      nowMs: createClock(),
    });
    const seen: boolean[] = [];
    source.subscribe((active) => seen.push(active));

    source.start();
    await Promise.resolve();
    emitAll(fake, RESTING);

    expect(seen).toEqual([]);
  });

  it("stop()이 구독을 끊고 열려 있던 조작 구간을 닫는다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({
      accelerometer: fake.adapter,
      nowMs: createClock(),
    });
    const seen: boolean[] = [];
    source.subscribe((active) => seen.push(active));

    source.start();
    await Promise.resolve();
    emitAll(fake, HANDLED);
    source.stop();

    expect(seen).toEqual([true, false]);
    expect(fake.isSubscribed).toBe(false);
  });

  /**
   * 정지 전 표본과 재개 후 표본 사이에는 임의 길이의 공백이 있다. 창을 비우지 않으면 둘이
   * 한 창에 섞여 **실제로는 없었던 움직임**이 편차로 잡힌다.
   */
  it("재개 시 정지 전 표본을 창에 남기지 않는다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({
      accelerometer: fake.adapter,
      nowMs: createClock(),
    });

    source.start();
    await Promise.resolve();
    emitAll(fake, HANDLED);
    source.stop();

    const seen: boolean[] = [];
    source.subscribe((active) => seen.push(active));
    source.start();
    await Promise.resolve();
    emitAll(fake, RESTING);

    expect(seen).toEqual([]);
  });

  it("가용성 확인이 끝나기 전에 stop()이 오면 구독을 걸지 않는다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({ accelerometer: fake.adapter });

    source.start();
    source.stop();
    await Promise.resolve();

    // 남으면 아무도 해제하지 않는 리스너가 되어 일시정지 중에도 센서가 계속 돈다.
    expect(fake.isSubscribed).toBe(false);
  });

  it("start()는 멱등이다", async () => {
    const fake = createFakeAccelerometer();
    const source = createDeviceMotionSource({ accelerometer: fake.adapter });

    source.start();
    source.start();
    await Promise.resolve();
    await Promise.resolve();
    source.stop();

    expect(fake.removeCount).toBe(1);
  });
});
