import { describe, expect, it, vi } from "vitest";

import type { DiagnosticsSink } from "../diagnostics";
import { createVisionDiagnostics, isDiagnosticsEnabled, visionDiagnostics } from "../diagnostics";

function recordingSink() {
  const events: { event: string; payload: Record<string, string | number | boolean> }[] = [];
  const sink: DiagnosticsSink = {
    log(event, payload) {
      events.push({ event, payload: { ...payload } });
    },
  };
  return { sink, events };
}

describe("createVisionDiagnostics", () => {
  it("delegate 선택을 남긴다 (설계 §8)", () => {
    const { sink, events } = recordingSink();
    createVisionDiagnostics(sink).detectorReady("CPU", "fp32");

    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ delegate: "CPU", modelVariant: "fp32" });
  });

  it("감지 불가를 남긴다", () => {
    const { sink, events } = recordingSink();
    createVisionDiagnostics(sink).detectorUnavailable("model fetch 404");

    expect(events[0]?.event).toContain("detector");
    expect(events[0]?.payload).toMatchObject({ reason: "model fetch 404" });
  });

  it("프레임 로그에 person 유무 · 라벨별 최고 score · 최종 판정 · 소요시간 · delegate를 남긴다", () => {
    const { sink, events } = recordingSink();

    createVisionDiagnostics(sink).frame({
      personPresent: true,
      topScores: { person: 0.812_3, "cell phone": 0.45 },
      awaySignal: false,
      phoneSignal: true,
      durationMs: 38.271,
      delegate: "GPU",
    });

    const payload = events[0]?.payload ?? {};
    expect(payload).toMatchObject({
      personPresent: true,
      away: false,
      phone: true,
      delegate: "GPU",
    });
    expect(payload["score:person"]).toBeCloseTo(0.81, 2);
    expect(payload["score:cell phone"]).toBeCloseTo(0.45, 2);
    expect(payload.durationMs).toBeCloseTo(38.3, 1);
  });

  // frontend/CLAUDE.md: 랜드마크 좌표는 로그 기록 금지 — 설계 §8이 bbox도 같은 성격으로 못박았다.
  it("어떤 이벤트에도 좌표·크기가 섞여 들어가지 않는다", () => {
    const { sink, events } = recordingSink();
    const diagnostics = createVisionDiagnostics(sink);

    diagnostics.detectorReady("GPU", "int8");
    diagnostics.frame({
      personPresent: true,
      topScores: { person: 0.9 },
      awaySignal: false,
      phoneSignal: false,
      durationMs: 12,
      delegate: "GPU",
    });
    diagnostics.transition("FOCUS", "AWAY", 1_700_000_000_000);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/originX|originY|bbox|boundingBox/i);
    for (const { payload } of events) {
      for (const value of Object.values(payload)) {
        // 스칼라만 남긴다 — 중첩 객체가 없으면 bbox가 딸려 들어갈 자리도 없다.
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });

  it("상태 전이는 이전/다음 상태와 시각을 남긴다", () => {
    const { sink, events } = recordingSink();
    createVisionDiagnostics(sink).transition("FOCUS", "PHONE", 1_700_000_000_000);

    expect(events[0]?.payload).toMatchObject({
      from: "FOCUS",
      to: "PHONE",
      atMs: 1_700_000_000_000,
    });
  });
});

/**
 * 앱에 동봉되는 `web-dist`는 **언제나 프로덕션 빌드**라 `import.meta.env.DEV`가 false다.
 * DEV로만 게이트하면 실기기에서 진단을 볼 방법이 아예 없다 — 2026-07-30에 실제로 그랬고
 * (번들에 `camera:stream` 0건), 그래서 URL 플래그를 도입했다.
 */
describe("isDiagnosticsEnabled", () => {
  it("DEV에서는 플래그 없이도 켜진다", () => {
    expect(isDiagnosticsEnabled("", true)).toBe(true);
  });

  it("프로덕션에서는 기본이 꺼짐이다 — 사용자에게 진단이 보이면 안 된다", () => {
    expect(isDiagnosticsEnabled("userId=7", false)).toBe(false);
  });

  it("프로덕션에서도 diag=1이면 켜진다 — 실기기 측정 경로", () => {
    expect(isDiagnosticsEnabled("userId=7&diag=1", false)).toBe(true);
  });

  it("diag=1이 아닌 값은 켜지 않는다", () => {
    expect(isDiagnosticsEnabled("diag=0", false)).toBe(false);
    expect(isDiagnosticsEnabled("diag=true", false)).toBe(false);
    expect(isDiagnosticsEnabled("diag", false)).toBe(false);
  });

  it("앞의 물음표가 있어도 동작한다", () => {
    expect(isDiagnosticsEnabled("?diag=1", false)).toBe(true);
  });
});

describe("visionDiagnostics (기본 인스턴스)", () => {
  it("개발 빌드에서는 console로 흘리고, 프로덕션에서는 아무것도 하지 않는다", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    visionDiagnostics.detectorReady("GPU", "fp32");

    // vitest는 DEV=true로 돈다. 프로덕션 빌드에서는 이 분기 자체가 사라진다(트리셰이킹).
    expect(debug).toHaveBeenCalledTimes(import.meta.env.DEV ? 1 : 0);
    debug.mockRestore();
  });
});
