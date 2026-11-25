import { describe, expect, it } from "vitest";

import { clampObservations, clampSessionSeconds } from "../sessionRequestClamp";

const START = Date.UTC(2026, 6, 25, 1, 0, 0);
const HOUR_LATER = Date.UTC(2026, 6, 25, 2, 0, 0);

describe("clampSessionSeconds", () => {
  it("범위 안 값은 그대로 둔다", () => {
    expect(
      clampSessionSeconds({
        startedAtMs: START,
        boundaryMs: HOUR_LATER,
        studySec: 3000,
        focusSec: 2500,
        events: [],
      }),
    ).toEqual({ studySec: 3000, focusSec: 2500 });
  });

  it("studySec은 경계 길이로, focusSec은 studySec으로 클램프한다", () => {
    expect(
      clampSessionSeconds({
        startedAtMs: START,
        boundaryMs: HOUR_LATER,
        studySec: 99999,
        focusSec: 99999,
        events: [],
      }),
    ).toEqual({ studySec: 3600, focusSec: 3600 });
  });

  it("음수는 0으로 클램프한다", () => {
    expect(
      clampSessionSeconds({
        startedAtMs: START,
        boundaryMs: HOUR_LATER,
        studySec: -5,
        focusSec: -5,
        events: [],
      }),
    ).toEqual({ studySec: 0, focusSec: 0 });
  });

  it("studySec 상한에서 PAUSE 구간을 뺀다", () => {
    const result = clampSessionSeconds({
      startedAtMs: START,
      boundaryMs: HOUR_LATER,
      studySec: 3600,
      focusSec: 3600,
      events: [
        {
          status: "PAUSE",
          startedAt: new Date(START).toISOString(),
          endedAt: new Date(START + 600_000).toISOString(),
        },
      ],
    });
    expect(result.studySec).toBe(3000);
    expect(result.focusSec).toBe(3000);
  });
});

describe("clampObservations", () => {
  const at = (sec: number) => new Date(START + sec * 1000).toISOString();

  it("세션 안의 기록은 그대로 둔다", () => {
    const items = [
      { type: "YAWN" as const, startedAt: at(10), endedAt: at(14) },
      { type: "YAWN" as const, startedAt: at(20), endedAt: at(20) },
    ];
    expect(clampObservations(items, START, HOUR_LATER)).toEqual(items);
  });

  it("시작이 세션 밖이면 버리고, 끝이 경계를 넘으면 경계로 자른다", () => {
    expect(
      clampObservations(
        [
          { type: "YAWN", startedAt: at(-5), endedAt: at(2) },
          { type: "YAWN", startedAt: at(3598), endedAt: at(3603) },
          { type: "YAWN", startedAt: at(3601), endedAt: at(3603) },
        ],
        START,
        HOUR_LATER,
      ),
    ).toEqual([{ type: "YAWN", startedAt: at(3598), endedAt: at(3600) }]);
  });

  it("서버 상한 1000건까지만 싣는다", () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({
      type: "YAWN" as const,
      startedAt: at(i),
      endedAt: at(i),
    }));
    expect(clampObservations(items, START, HOUR_LATER)).toHaveLength(1000);
  });
});
