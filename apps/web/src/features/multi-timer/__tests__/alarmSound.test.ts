import { describe, expect, it, vi } from "vitest";

import { createAlarmSound } from "../alarmSound";

interface FakeOscillator {
  type: OscillatorType;
  frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

function fakeContext(state: AudioContextState = "suspended") {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const fake = {
    state,
    currentTime: 2,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const oscillator: FakeOscillator = {
        type: "sine",
        frequency: { value: 440, setValueAtTime: vi.fn() },
        connect: vi.fn((node: unknown) => node),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain: FakeGain = {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn((node: unknown) => node),
      };
      gains.push(gain);
      return gain;
    }),
  };
  return { context: fake as unknown as AudioContext, fake, oscillators, gains };
}

describe("createAlarmSound", () => {
  it("prime 은 컨텍스트를 한 번만 만들고 멈춰 있으면 resume 한다", () => {
    const { context, fake } = fakeContext("suspended");
    const factory = vi.fn(() => context);
    const alarm = createAlarmSound(factory);

    alarm.prime();
    alarm.prime();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.resume).toHaveBeenCalled();
  });

  it("이미 돌고 있는 컨텍스트는 resume 하지 않는다", () => {
    const { context, fake } = fakeContext("running");
    const alarm = createAlarmSound(() => context);

    alarm.prime();

    expect(fake.resume).not.toHaveBeenCalled();
  });

  it("play 는 사인파 두 음을 이어서 예약한다", () => {
    const { context, oscillators, gains } = fakeContext("running");
    const alarm = createAlarmSound(() => context);

    alarm.play();

    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((o) => o.type)).toEqual(["sine", "sine"]);
    expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(880, 2);
    expect(oscillators[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(
      1320,
      expect.closeTo(2.16),
    );
    expect(oscillators[0]?.start).toHaveBeenCalledWith(2);
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(expect.closeTo(2.16));
    expect(oscillators[1]?.start).toHaveBeenCalledWith(expect.closeTo(2.16));
    expect(oscillators[1]?.stop).toHaveBeenCalledWith(expect.closeTo(2.38));
    for (const gain of gains) {
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, expect.any(Number));
      expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
    }
  });

  it("prime 없이 play 해도 컨텍스트를 만들어 소리를 낸다", () => {
    const { context, oscillators } = fakeContext("running");
    const factory = vi.fn(() => context);
    const alarm = createAlarmSound(factory);

    alarm.play();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(2);
  });

  it("돌고 있지 않은 컨텍스트에는 음을 예약하지 않고 깨우기만 한다", () => {
    const { context, fake, oscillators } = fakeContext("suspended");
    const alarm = createAlarmSound(() => context);

    alarm.play();

    expect(oscillators).toHaveLength(0);
    expect(fake.resume).toHaveBeenCalled();
  });

  it("컨텍스트를 만들 수 없어도 prime 과 play 는 throw 하지 않는다", () => {
    const alarm = createAlarmSound(() => {
      throw new Error("NotSupportedError");
    });

    expect(() => alarm.prime()).not.toThrow();
    expect(() => alarm.play()).not.toThrow();
    expect(() => alarm.dispose()).not.toThrow();
  });

  it("노드 생성이 throw 해도 play 는 throw 하지 않는다", () => {
    const { context, fake } = fakeContext("running");
    fake.createOscillator.mockImplementation(() => {
      throw new Error("InvalidStateError");
    });
    const alarm = createAlarmSound(() => context);

    expect(() => alarm.play()).not.toThrow();
  });

  it("resume 이 거절돼도 밖으로 새지 않는다", async () => {
    const { context, fake } = fakeContext("suspended");
    fake.resume.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));
    const alarm = createAlarmSound(() => context);

    expect(() => alarm.prime()).not.toThrow();
    await Promise.resolve();
  });

  it("dispose 는 컨텍스트를 닫고 다음 play 때 새로 만든다", () => {
    const first = fakeContext("running");
    const second = fakeContext("running");
    const factory = vi.fn().mockReturnValueOnce(first.context).mockReturnValueOnce(second.context);
    const alarm = createAlarmSound(factory);

    alarm.prime();
    alarm.dispose();
    alarm.play();

    expect(first.fake.close).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(second.oscillators).toHaveLength(2);
  });
});
