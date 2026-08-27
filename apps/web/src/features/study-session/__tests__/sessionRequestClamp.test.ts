import { describe, expect, it } from "vitest";

import { clampSessionSeconds } from "../sessionRequestClamp";

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
