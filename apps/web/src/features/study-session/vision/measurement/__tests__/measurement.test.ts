import { describe, expect, it, vi } from "vitest";

import { DEFAULT_DETECTION_PARAMS } from "../../../detection";
import type { FrameDiagnostics, VisionDiagnostics } from "../../diagnostics";
import { createMeasurement, stateLabel } from "../measurement";
import {
  FACE_BASELINE_MIN_RATIO,
  FACE_BASELINE_SAMPLES,
  FACE_FRAME_DIVISOR,
  SLEEP_THRESHOLDS,
} from "../../visionConfig";

/** 호출을 세는 기본 진단. 껍데기가 전부 넘기는지 확인한다. */
function baseSpy(): VisionDiagnostics {
  return {
    detectorReady: vi.fn(),
    detectorUnavailable: vi.fn(),
    frame: vi.fn(),
    frameDropped: vi.fn(),
    faceReady: vi.fn(),
    faceUnavailable: vi.fn(),
    transition: vi.fn(),
    cameraStream: vi.fn(),
  };
}

function frame(overrides: Partial<FrameDiagnostics> = {}): FrameDiagnostics {
  return {
    personPresent: true,
    topScores: { person: 0.9 },
    awaySignal: false,
    phoneSignal: false,
    durationMs: 100,
    delegate: "CPU",
    sleepEyesSignal: false,
    sleepFaceSignal: false,
    faceBaseline: true,
    face: null,
    ...overrides,
  };
}

describe("stateLabel", () => {
  it("상태를 로그 한 칸짜리 문자열로 줄인다", () => {
    expect(stateLabel({ kind: "FOCUS" })).toBe("FOCUS");
    expect(stateLabel({ kind: "DISTRACTION", trigger: "SLEEP" })).toBe("DISTRACTION:SLEEP");
    expect(stateLabel({ kind: "PAUSE", trigger: "MANUAL" })).toBe("PAUSE:MANUAL");
  });
});

describe("createMeasurement", () => {
  it("받은 호출을 전부 원래 진단으로 넘긴다", () => {
    const base = baseSpy();
    const m = createMeasurement(base);

    m.frame(frame());
    m.frameDropped();
    m.transition("FOCUS", "DISTRACTION:SLEEP", 1000);
    m.detectorReady("CPU", "int8");
    m.detectorUnavailable("model fetch 404");
    m.faceReady("CPU");
    m.faceUnavailable("timeout");
    m.cameraStream({ width: 1280, height: 720, aspectRatio: 1.78, facingMode: "user" });

    expect(base.frame).toHaveBeenCalledTimes(1);
    expect(base.frameDropped).toHaveBeenCalledTimes(1);
    expect(base.transition).toHaveBeenCalledTimes(1);
    expect(base.detectorReady).toHaveBeenCalledWith("CPU", "int8");
    expect(base.detectorUnavailable).toHaveBeenCalledWith("model fetch 404");
    expect(base.faceReady).toHaveBeenCalledWith("CPU");
    expect(base.faceUnavailable).toHaveBeenCalledWith("timeout");
    expect(base.cameraStream).toHaveBeenCalledTimes(1);
  });

  it("구간 이름으로 통계를 나눈다", () => {
    const m = createMeasurement(baseSpy());

    m.mark("A1");
    m.frame(frame({ durationMs: 100 }));
    m.mark("A2");
    m.frame(frame({ durationMs: 200 }));
    m.frame(frame({ durationMs: 300 }));

    const dump = JSON.parse(m.dump()) as { segments: { name: string; frames: number }[] };
    const names = dump.segments.map((segment) => segment.name);
    expect(names).toEqual(["A1", "A2"]);
    expect(dump.segments[1]?.frames).toBe(2);
  });

  it("추론 시간의 중앙값과 상위값을 낸다", () => {
    const m = createMeasurement(baseSpy());
    for (const ms of [10, 20, 30, 40, 100]) {
      m.frame(frame({ durationMs: ms }));
    }

    const seg = (JSON.parse(m.dump()) as { segments: { object: Record<string, number> }[] })
      .segments[0];
    expect(seg?.object.p50).toBe(30);
    expect(seg?.object.p95).toBe(100);
    expect(seg?.object.max).toBe(100);
  });

  it("버린 틱을 구간별로 센다", () => {
    const m = createMeasurement(baseSpy());
    m.frameDropped();
    m.mark("B");
    m.frameDropped();
    m.frameDropped();

    const dump = JSON.parse(m.dump()) as { segments: { dropped: number }[] };
    expect(dump.segments[0]?.dropped).toBe(1);
    expect(dump.segments[1]?.dropped).toBe(2);
  });

  it("눈 감김 점수의 분포를 낸다 — 임계를 올릴지 내릴지 판단할 근거다", () => {
    const m = createMeasurement(baseSpy());
    for (const score of [0.1, 0.2, 0.3, 0.8, 0.9]) {
      m.frame(
        frame({
          face: {
            present: true,
            eye: { eyeBlinkLeft: score, eyeBlinkRight: score },
            skipReason: null,
            durationMs: 50,
            delegate: "CPU",
          },
        }),
      );
    }

    const seg = (JSON.parse(m.dump()) as { segments: { eye: Record<string, number> }[] })
      .segments[0];
    expect(seg?.eye.samples).toBe(5);
    expect(seg?.eye.p50).toBeCloseTo(0.3);
    expect(seg?.eye.p05).toBeCloseTo(0.1);
  });

  it("눈 감김은 판정과 같은 값을 쓴다 — 두 눈 중 덜 감긴 쪽", () => {
    const m = createMeasurement(baseSpy());
    m.frame(
      frame({
        face: {
          present: true,
          eye: { eyeBlinkLeft: 0.2, eyeBlinkRight: 0.8 },
          skipReason: null,
          durationMs: 50,
          delegate: "CPU",
        },
      }),
    );

    const seg = (JSON.parse(m.dump()) as { segments: { eye: Record<string, number> }[] })
      .segments[0];
    expect(seg?.eye.p50).toBeCloseTo(0.2);
  });

  it("얼굴 인식 비율과 건너뛴 이유를 센다", () => {
    const m = createMeasurement(baseSpy());
    m.frame(
      frame({
        face: {
          present: true,
          eye: null,
          skipReason: "face-too-small",
          durationMs: 50,
          delegate: "CPU",
        },
      }),
    );
    m.frame(
      frame({
        face: { present: false, eye: null, skipReason: "no-face", durationMs: 50, delegate: "CPU" },
      }),
    );

    const seg = (
      JSON.parse(m.dump()) as {
        segments: {
          face: { ran: number; presentRatio: number; skipped: Record<string, number> };
        }[];
      }
    ).segments[0];
    expect(seg?.face.ran).toBe(2);
    expect(seg?.face.presentRatio).toBeCloseTo(0.5);
    expect(seg?.face.skipped["face-too-small"]).toBe(1);
    expect(seg?.face.skipped["no-face"]).toBe(1);
  });

  it("졸음 원신호와 기준선 충족 프레임을 센다", () => {
    const m = createMeasurement(baseSpy());
    m.frame(frame({ sleepEyesSignal: true, faceBaseline: true }));
    m.frame(frame({ sleepFaceSignal: true, faceBaseline: false }));

    const seg = (
      JSON.parse(m.dump()) as {
        segments: { sleepEyes: number; sleepFace: number; baseline: number }[];
      }
    ).segments[0];
    expect(seg?.sleepEyes).toBe(1);
    expect(seg?.sleepFace).toBe(1);
    expect(seg?.baseline).toBe(1);
  });

  it("설정 스냅샷을 같이 낸다 — 어느 조건에서 나온 숫자인지 덩어리 안에 있어야 한다", () => {
    const dump = JSON.parse(createMeasurement(baseSpy(), { faceLostEnabled: true }).dump()) as {
      config: Record<string, number | boolean | null>;
    };

    expect(dump.config).toMatchObject({
      faceFrameDivisor: FACE_FRAME_DIVISOR,
      eyeClosure: SLEEP_THRESHOLDS.eyeClosure,
      baselineSamples: FACE_BASELINE_SAMPLES,
      baselineMinRatio: FACE_BASELINE_MIN_RATIO,
    });
    expect(dump.config.sleepEyesEnterMs).toBe(DEFAULT_DETECTION_PARAMS.SLEEP_EYES.enterMs);
  });

  it("엎드림 판정이 꺼져 있으면 기본 스냅샷에 표시되고 기준선 값은 의미가 없어 null이다", () => {
    const dump = JSON.parse(createMeasurement(baseSpy()).dump()) as {
      config: {
        faceLostEnabled: boolean;
        baselineSamples: number | null;
        baselineMinRatio: number | null;
      };
    };

    expect(dump.config.faceLostEnabled).toBe(false);
    expect(dump.config.baselineSamples).toBeNull();
    expect(dump.config.baselineMinRatio).toBeNull();
  });

  it("좌표로 읽힐 키가 덩어리에 없다", () => {
    const m = createMeasurement(baseSpy());
    m.frame(
      frame({
        face: {
          present: true,
          eye: { eyeBlinkLeft: 0.2, eyeBlinkRight: 0.2 },
          skipReason: null,
          durationMs: 50,
          delegate: "CPU",
        },
      }),
    );

    const text = m.dump();
    for (const key of [
      "originX",
      "originY",
      "landmark",
      "matrix",
      "interOcular",
      "width",
      "height",
    ]) {
      expect(text).not.toContain(key);
    }
  });
});

describe("분당 요약", () => {
  it("1분이 지날 때마다 한 줄을 낸다", () => {
    const lines: string[] = [];
    let now = 0;
    const m = createMeasurement(baseSpy(), {
      now: () => now,
      onLine: (line) => lines.push(line),
    });

    m.frame(frame());
    now = 60_000;
    m.frame(frame());
    now = 120_000;
    m.frame(frame());

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("drop=");
    expect(lines[1]).toContain("min=2");
  });

  it("1분이 안 지나면 내지 않는다", () => {
    const lines: string[] = [];
    let now = 0;
    const m = createMeasurement(baseSpy(), {
      now: () => now,
      onLine: (line) => lines.push(line),
    });

    m.frame(frame());
    now = 30_000;
    m.frame(frame());

    expect(lines).toHaveLength(0);
  });

  it("한 줄은 지난 1분치만 담는다 — 누적이면 구간 사이의 변화가 묻힌다", () => {
    const lines: string[] = [];
    let now = 0;
    const m = createMeasurement(baseSpy(), {
      now: () => now,
      onLine: (line) => lines.push(line),
    });

    m.frame(frame());
    m.frame(frame());
    now = 60_000;
    m.frame(frame());
    now = 120_000;
    m.frame(frame());

    expect(lines[0]).toContain("frames=3");
    expect(lines[1]).toContain("frames=1");
  });
});

describe("진단이 꺼져 있을 때", () => {
  it("값을 모으지 않는다 — 측정 대상이 발열인데 계측이 부하를 더하면 안 된다", () => {
    const base = baseSpy();
    const m = createMeasurement(base, { enabled: false });

    m.frame(frame());
    m.frameDropped();
    m.mark("A");
    m.transition("FOCUS", "PAUSE:MANUAL", 1000);

    expect(base.frame).toHaveBeenCalledTimes(1);
    expect(base.frameDropped).toHaveBeenCalledTimes(1);
    expect(base.transition).toHaveBeenCalledTimes(1);
    const dump = JSON.parse(m.dump()) as { segments: unknown[]; thermalRounds: unknown[] };
    expect(dump.segments).toHaveLength(0);
    expect(dump.thermalRounds).toHaveLength(0);
  });

  it("요약 줄도 내지 않는다", () => {
    const lines: string[] = [];
    let now = 0;
    const m = createMeasurement(baseSpy(), {
      enabled: false,
      now: () => now,
      onLine: (line) => lines.push(line),
    });

    m.frame(frame());
    now = 120_000;
    m.frame(frame());

    expect(lines).toHaveLength(0);
  });
});

describe("콘솔 노출", () => {
  it("진단이 켜져 있으면 콘솔에서 mark와 dump를 부를 수 있다", async () => {
    await import("../index");
    // vitest는 DEV=true로 돌므로 진단이 켜진 경로와 같다.
    const handle = window.__focusonMeasure;

    expect(handle).toBeDefined();
    handle?.mark("콘솔 확인");
    expect(typeof handle?.dump()).toBe("string");
  });
});

describe("구간 기록", () => {
  it("시나리오 번호·이름·기대 문장이 구간에 붙는다 — 덩어리를 읽는 사람이 이것으로 해석한다", () => {
    const m = createMeasurement(baseSpy());

    m.mark("A1 눈 감김 진입", {
      id: "A1",
      name: "눈 감김 진입",
      instruction: "눈을 감으세요",
      expected: "10초쯤에 졸음으로 전이해야 한다",
      prepareSec: 10,
      observeSec: 30,
    });
    m.frame(frame({ durationMs: 123 }));

    const dump = JSON.parse(m.dump()) as {
      segments: {
        name: string;
        scenario: { id: string; expected: string } | null;
        frames: number;
        object: Record<string, number>;
      }[];
    };
    expect(dump.segments[0]).toMatchObject({ name: "A1 눈 감김 진입", frames: 1 });
    expect(dump.segments[0]?.scenario).toEqual({
      id: "A1",
      name: "눈 감김 진입",
      expected: "10초쯤에 졸음으로 전이해야 한다",
    });
    // 기대 문장이 붙어도 원본 수치는 그대로다.
    expect(dump.segments[0]?.object.p50).toBe(123);
  });

  it("시나리오 없이 연 구간은 기대 문장이 없다", () => {
    const m = createMeasurement(baseSpy());
    m.mark("손으로 표시한 구간");
    m.frame(frame());

    const dump = JSON.parse(m.dump()) as { segments: { scenario: unknown }[] };
    expect(dump.segments[0]?.scenario).toBeNull();
  });

  it("구간에서 일어난 전이를 그대로 싣는다 — 일시정지도 거르지 않는다", () => {
    let nowMs = 1000;
    const m = createMeasurement(baseSpy(), { now: () => nowMs });

    m.mark("A1 눈 감김 진입");
    nowMs = 13_000;
    m.transition("FOCUS", "DISTRACTION:SLEEP", nowMs);
    nowMs = 20_000;
    m.transition("DISTRACTION:SLEEP", "PAUSE:MANUAL", nowMs);

    const dump = JSON.parse(m.dump()) as {
      segments: { transitions: { from: string; to: string; atSec: number }[] }[];
    };
    expect(dump.segments[0]?.transitions).toEqual([
      { from: "FOCUS", to: "DISTRACTION:SLEEP", atSec: 12 },
      { from: "DISTRACTION:SLEEP", to: "PAUSE:MANUAL", atSec: 19 },
    ]);
  });

  it("구간 시작 시점의 상태를 함께 남긴다 — 전이 목록의 출발점이다", () => {
    const m = createMeasurement(baseSpy());

    m.transition("FOCUS", "DISTRACTION:SLEEP", 1000);
    m.mark("A2 깨어남 복귀");

    const dump = JSON.parse(m.dump()) as { segments: { entryLabel: string }[] };
    expect(dump.segments[1]?.entryLabel).toBe("DISTRACTION:SLEEP");
  });

  it("새 세션이 시작되면 출발 상태가 집중으로 돌아간다 — 앞 세션의 마지막 상태가 남으면 안 된다", () => {
    const m = createMeasurement(baseSpy());

    m.transition("FOCUS", "DISTRACTION:SLEEP", 1000);
    m.sessionStarted();
    m.mark("A6 엎드림 조기");

    const dump = JSON.parse(m.dump()) as { segments: { entryLabel: string }[] };
    expect(dump.segments[1]?.entryLabel).toBe("FOCUS");
  });

  it("꺼져 있으면 전이도 모으지 않는다", () => {
    const base = baseSpy();
    const m = createMeasurement(base, { enabled: false });

    m.transition("FOCUS", "DISTRACTION:SLEEP", 1000);

    expect(base.transition).toHaveBeenCalledTimes(1);
    expect((JSON.parse(m.dump()) as { segments: unknown[] }).segments).toHaveLength(0);
  });
});

describe("리허설 표시", () => {
  it("리허설이면 덩어리에 플래그가 들어간다 — 본 측정 수치로 오인되면 안 된다", () => {
    const m = createMeasurement(baseSpy(), { rehearsal: true });

    expect((JSON.parse(m.dump()) as { rehearsal: boolean }).rehearsal).toBe(true);
  });

  it("기본은 리허설이 아니다", () => {
    const m = createMeasurement(baseSpy());

    expect((JSON.parse(m.dump()) as { rehearsal: boolean }).rehearsal).toBe(false);
  });
});

describe("발열 회차 기록", () => {
  it("단계와 시각이 덩어리에 들어간다", () => {
    const m = createMeasurement(baseSpy());

    m.setThermal({
      round: 1,
      running: false,
      elapsedSec: 720,
      minute: 12,
      marks: [
        { stage: "fair", atSec: 200 },
        { stage: "serious", atSec: 720 },
      ],
      aborted: false,
      seriousAtSec: 720,
    });

    const dump = JSON.parse(m.dump()) as {
      thermalRounds: { seriousAtSec: number; marks: { stage: string }[]; aborted: boolean }[];
    };
    expect(dump.thermalRounds[0]?.seriousAtSec).toBe(720);
    expect(dump.thermalRounds[0]?.marks).toHaveLength(2);
    expect(dump.thermalRounds[0]?.aborted).toBe(false);
  });

  it("회차를 다시 시작해도 앞 회차가 덮이지 않는다", () => {
    const m = createMeasurement(baseSpy());

    m.setThermal({
      round: 1,
      running: false,
      elapsedSec: 600,
      minute: 10,
      marks: [],
      aborted: true,
      seriousAtSec: null,
    });
    m.setThermal({
      round: 2,
      running: false,
      elapsedSec: 900,
      minute: 15,
      marks: [{ stage: "serious", atSec: 900 }],
      aborted: false,
      seriousAtSec: 900,
    });

    const dump = JSON.parse(m.dump()) as { thermalRounds: { seriousAtSec: number | null }[] };
    expect(dump.thermalRounds).toHaveLength(2);
    expect(dump.thermalRounds[0]?.seriousAtSec).toBeNull();
    expect(dump.thermalRounds[1]?.seriousAtSec).toBe(900);
  });

  it("회차를 안 돌렸으면 빈 목록이다", () => {
    const dump = JSON.parse(createMeasurement(baseSpy()).dump()) as { thermalRounds: unknown[] };

    expect(dump.thermalRounds).toEqual([]);
  });

  it("꺼져 있으면 기록하지 않는다", () => {
    const m = createMeasurement(baseSpy(), { enabled: false });
    m.setThermal({
      round: 1,
      running: true,
      elapsedSec: 10,
      minute: 0,
      marks: [],
      aborted: false,
      seriousAtSec: null,
    });

    expect((JSON.parse(m.dump()) as { thermalRounds: unknown[] }).thermalRounds).toEqual([]);
  });
});

describe("세션 시작 신호", () => {
  it("첫 프레임에 한 번만 알린다 — 패널을 세션이 시작될 때 붙이는 신호다", () => {
    const onSessionSignal = vi.fn();
    const m = createMeasurement(baseSpy(), { onSessionSignal });

    expect(onSessionSignal).not.toHaveBeenCalled();

    m.frame(frame());
    m.frame(frame());

    expect(onSessionSignal).toHaveBeenCalledTimes(1);
  });

  it("모델 실패도 신호다 — 프레임이 영영 오지 않는 경로라 이것이 없으면 아무도 알리지 못한다", () => {
    const onSessionSignal = vi.fn();
    const m = createMeasurement(baseSpy(), { onSessionSignal });

    m.detectorUnavailable("model fetch 404");

    expect(onSessionSignal).toHaveBeenCalledTimes(1);
    // 신호를 받은 쪽이 곧바로 그리므로, 그때 점검 줄에 실패가 이미 들어 있어야 한다.
    expect(m.preflight().detector).toBe("unavailable");
  });

  it("얼굴 모델 실패도 신호다", () => {
    const onSessionSignal = vi.fn();
    const m = createMeasurement(baseSpy(), { onSessionSignal });

    m.faceUnavailable("timeout");

    expect(onSessionSignal).toHaveBeenCalledTimes(1);
  });

  it("신호가 여러 번 와도 한 번만 알린다", () => {
    const onSessionSignal = vi.fn();
    const m = createMeasurement(baseSpy(), { onSessionSignal });

    m.detectorUnavailable("model fetch 404");
    m.faceUnavailable("timeout");
    m.frame(frame());

    expect(onSessionSignal).toHaveBeenCalledTimes(1);
  });

  it("꺼져 있으면 알리지 않는다", () => {
    const onSessionSignal = vi.fn();
    const m = createMeasurement(baseSpy(), { enabled: false, onSessionSignal });

    m.frame(frame());
    m.detectorUnavailable("model fetch 404");

    expect(onSessionSignal).not.toHaveBeenCalled();
  });
});

describe("사전 점검", () => {
  it("꺼져 있으면 점검 값을 만들지도 않는다 — 꺼졌을 때 비용이 0에 가까워야 한다", () => {
    const m = createMeasurement(baseSpy(), { enabled: false });

    m.detectorReady("CPU", "int8");
    m.cameraStream({ width: 1280, height: 720, aspectRatio: 1.78, facingMode: "user" });

    expect(m.preflight()).toMatchObject({ detector: "대기", camera: null });
  });

  it("모델과 카메라가 준비되기 전에는 대기로 남는다", () => {
    const m = createMeasurement(baseSpy());

    expect(m.preflight()).toMatchObject({ detector: "대기", face: "대기", camera: null });
  });

  it("진단으로 들어온 준비 상태를 그대로 모은다", () => {
    const m = createMeasurement(baseSpy());

    m.detectorReady("CPU", "int8");
    m.faceReady("CPU");
    m.cameraStream({ width: 1280, height: 720, aspectRatio: 1.78, facingMode: "user" });

    expect(m.preflight()).toMatchObject({
      detector: "ready",
      face: "ready",
      camera: "1280x720",
    });
  });

  it("실패도 그대로 남긴다 — 16분을 잘못된 설정으로 날리지 않게 한다", () => {
    const m = createMeasurement(baseSpy());

    m.detectorUnavailable("model fetch 404");
    m.faceUnavailable("timeout");

    expect(m.preflight()).toMatchObject({ detector: "unavailable", face: "unavailable" });
  });

  it("사전 점검도 덩어리에 들어간다", () => {
    const m = createMeasurement(baseSpy());
    m.detectorReady("CPU", "int8");

    const dump = JSON.parse(m.dump()) as { preflight: { detector: string } };
    expect(dump.preflight.detector).toBe("ready");
  });
});

describe("진행 중 통계", () => {
  it("버린 틱과 추론 상위값을 지금 시점으로 돌려준다 — 패널이 읽는다", () => {
    const m = createMeasurement(baseSpy());

    for (const ms of [100, 200, 300]) {
      m.frame(frame({ durationMs: ms }));
    }
    m.frameDropped();
    m.mark("B");
    m.frameDropped();

    const stats = m.stats();
    expect(stats.dropped).toBe(2);
    expect(stats.segmentTransitions).toBe(0);
    // 버킷 단위라 정확히 같지는 않다. 한 버킷 안에는 들어와야 한다.
    expect(stats.objectP95).toBeGreaterThanOrEqual(280);
    expect(stats.objectP95).toBeLessThanOrEqual(320);
  });

  it("표본이 많아도 매번 전체를 다시 훑지 않는다 — 이 회차의 CPU를 재는 중이다", () => {
    const m = createMeasurement(baseSpy());
    for (let i = 0; i < 4000; i += 1) {
      m.frame(frame({ durationMs: 100 + (i % 300) }));
    }

    const startedAt = performance.now();
    for (let i = 0; i < 200; i += 1) {
      m.stats();
    }

    // 200번 읽는 데 표본 수에 비례하는 시간이 들면 안 된다.
    expect(performance.now() - startedAt).toBeLessThan(200);
  });

  it("꺼져 있으면 0이다", () => {
    const m = createMeasurement(baseSpy(), { enabled: false });
    m.frame(frame());

    expect(m.stats()).toMatchObject({ dropped: 0, objectP95: null });
  });
});
