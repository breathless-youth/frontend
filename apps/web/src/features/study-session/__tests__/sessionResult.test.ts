import type {
  StatusEventPayload,
  StudyEventStatus,
  StudySessionResponse,
} from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import {
  aggregateEvents,
  formatClockRange,
  formatClockTime,
  formatEventDuration,
  timelineSegments,
  timelineSummaryLabel,
  toSessionResultView,
} from "../sessionResult";

/**
 * 시각은 **로컬 타임존**으로 표시되므로, 기대값을 하드코딩하면 CI 타임존에서 깨진다.
 * 그래서 픽스처를 로컬 시각으로 만들고(`new Date(y, m, d, h, min)`) 그 로컬 시각을 그대로
 * 기대한다 — 어떤 TZ에서 돌려도 같은 결과가 나온다.
 */
const SESSION_START = new Date(2026, 6, 25, 21, 3, 0);
const SESSION_END = new Date(2026, 6, 25, 22, 48, 0);

function at(offsetSec: number): string {
  return new Date(SESSION_START.getTime() + offsetSec * 1000).toISOString();
}

function event(status: StudyEventStatus, fromSec: number, durationSec: number): StatusEventPayload {
  return { status, startedAt: at(fromSec), endedAt: at(fromSec + durationSec) };
}

/**
 * SCR-S4 "구현용 예시 데이터 (확정 모델로 재계산한 값)" 그대로다.
 *
 * Figma 예시는 구 모델(화면 꺼짐 = 비집중) 기준이라 쓰지 않는다. 확정 모델에서는 화면 꺼짐
 * 3분이 일시정지로 옮겨가 **총 공부에서 빠지고**(105분 벽시계 → 102분 총 공부), 비집중 합계도
 * 21분 → 18분이 된다. 이 픽스처가 곧 "시각 범위 ≠ 총 공부 시간"의 실증이다.
 */
function exampleSession(overrides: Partial<StudySessionResponse> = {}): StudySessionResponse {
  return {
    id: 10,
    userId: 1,
    statDate: "2026-07-25",
    startedAt: SESSION_START.toISOString(),
    endedAt: SESSION_END.toISOString(),
    studySec: 6120,
    focusSec: 5040,
    focusRate: 82.35,
    events: [
      event("AWAY", 600, 300),
      event("PHONE", 1200, 200),
      event("DEVICE", 1800, 128),
      event("PAUSE", 2400, 180),
      event("AWAY", 3000, 280),
      event("PHONE", 3600, 172),
    ],
    ...overrides,
  };
}

/**
 * 2026-07-27(8차 인터뷰)로 표기 규칙이 분 단위로 통일되면서 이 함수도 초를 버렸다.
 * 예전 기대값(`9분 40초`)은 Figma 실측과 일치했지만 그 근거였던 voice-tone의
 * "상세 맥락은 M분 S초" 조항이 폐기됐다 — **의도적으로 Figma와 달라진 지점이다.**
 */
describe("formatEventDuration — 통계 행(분 단위, 초 금지)", () => {
  it("1시간 미만은 분만 쓴다 — 초를 버린다", () => {
    expect(formatEventDuration(580)).toBe("9분");
    expect(formatEventDuration(372)).toBe("6분");
    expect(formatEventDuration(128)).toBe("2분");
    expect(formatEventDuration(180)).toBe("3분");
  });

  it("1분 미만은 '1분 미만'이다", () => {
    expect(formatEventDuration(40)).toBe("1분 미만");
    expect(formatEventDuration(0)).toBe("1분 미만");
    expect(formatEventDuration(-5)).toBe("1분 미만");
  });

  it("1시간 이상은 시간+분으로 끊는다", () => {
    expect(formatEventDuration(3661)).toBe("1시간 1분");
    expect(formatEventDuration(3600)).toBe("1시간");
  });

  it("어떤 입력에도 '초'가 들어가지 않는다", () => {
    for (const seconds of [-5, 0, 1, 59, 60, 128, 580, 3599, 3600, 3661]) {
      expect(formatEventDuration(seconds)).not.toContain("초");
    }
  });
});

describe("formatClockTime / formatClockRange", () => {
  it("24시간제 HH:MM으로 zero-pad 한다", () => {
    expect(formatClockTime(new Date(2026, 6, 25, 9, 5).toISOString())).toBe("09:05");
    expect(formatClockTime(new Date(2026, 6, 25, 22, 48).toISOString())).toBe("22:48");
  });

  it("자정은 24:00이 아니라 00:00이다", () => {
    expect(formatClockTime(new Date(2026, 6, 25, 0, 0).toISOString())).toBe("00:00");
  });

  it("구분자는 en dash 양옆 공백이다", () => {
    const range = formatClockRange(SESSION_START.toISOString(), SESSION_END.toISOString());
    expect(range).toBe("21:03 – 22:48");
    // 하이픈(-)이나 em dash(—)로 바뀌면 표기 회귀다.
    expect(range).toContain("–");
  });
});

describe("aggregateEvents", () => {
  it("유형별 건수와 시간을 합산한다", () => {
    const tallies = aggregateEvents(exampleSession().events);

    expect(tallies.get("AWAY")).toMatchObject({ status: "AWAY", count: 2, durationSec: 580 });
    expect(tallies.get("PHONE")).toMatchObject({ status: "PHONE", count: 2, durationSec: 372 });
    expect(tallies.get("DEVICE")).toMatchObject({ status: "DEVICE", count: 1, durationSec: 128 });
    expect(tallies.get("PAUSE")).toMatchObject({ status: "PAUSE", count: 1, durationSec: 180 });
  });

  /**
   * 펼침 영역이 "언제 얼마나"를 그리려면 합계만으로는 부족하다(BY-336) —
   * `2회 · 580초`가 300+280인지 560+20인지 구분되지 않는다.
   */
  it("발생 구간을 순서대로 보존한다 — 합계만으로는 분포를 알 수 없다", () => {
    const away = aggregateEvents(exampleSession().events).get("AWAY");

    expect(away?.occurrences).toEqual([
      { clockRange: "21:13 – 21:18", durationSec: 300 },
      { clockRange: "21:53 – 21:57", durationSec: 280 },
    ]);
    // 건수와 구간 수는 항상 같다.
    expect(away?.occurrences).toHaveLength(away!.count);
  });

  /**
   * 구간은 자기 길이만 내림하고 합계는 ms 누적에서 한 번만 내림한다 — 그래서 구간 합이 합계보다
   * 최대 (건수-1)초 작을 수 있다. 표기가 분 단위라 화면에는 드러나지 않지만, 합계 쪽이 정확한
   * 값이라는 것을 고정해 둔다(반대로 맞추면 `ms 먼저 합산` 규칙이 깨진다).
   */
  it("구간 합이 합계보다 작아도 합계를 깎지 않는다", () => {
    const start = SESSION_START.getTime();
    const half = (fromMs: number): StatusEventPayload => ({
      status: "AWAY",
      startedAt: new Date(start + fromMs).toISOString(),
      endedAt: new Date(start + fromMs + 1500).toISOString(),
    });
    const away = aggregateEvents([half(0), half(10_000)]).get("AWAY");

    expect(away?.durationSec).toBe(3);
    expect(away?.occurrences.reduce((sum, each) => sum + each.durationSec, 0)).toBe(2);
  });

  it("ms를 먼저 다 더하고 마지막에 한 번만 내림한다 — 건당 내림하면 시간이 사라진다", () => {
    const start = SESSION_START.getTime();
    const half = (fromMs: number): StatusEventPayload => ({
      status: "AWAY",
      startedAt: new Date(start + fromMs).toISOString(),
      endedAt: new Date(start + fromMs + 1500).toISOString(),
    });

    // 1.5초 × 2 = 3초. 건당 내림하면 1+1=2초로 1초가 증발한다.
    expect(aggregateEvents([half(0), half(10_000)]).get("AWAY")?.durationSec).toBe(3);
  });

  it("이벤트가 없으면 비어 있다", () => {
    expect(aggregateEvents([]).size).toBe(0);
  });
});

describe("timelineSegments", () => {
  it("벽시계 구간에 대한 비율로 환산한다", () => {
    const segments = timelineSegments(exampleSession());

    expect(segments).toHaveLength(6);
    // 첫 이벤트: 시작 600초 지점, 300초 길이, 전체 6300초.
    expect(segments[0]!.status).toBe("AWAY");
    expect(segments[0]!.startRatio).toBeCloseTo(600 / 6300, 6);
    expect(segments[0]!.widthRatio).toBeCloseTo(300 / 6300, 6);
  });

  it("PAUSE도 세그먼트로 남는다 — 회색으로 그려야 하기 때문", () => {
    expect(timelineSegments(exampleSession()).some((s) => s.status === "PAUSE")).toBe(true);
  });

  it("길이 0인 세션은 세그먼트가 없다 — 0으로 나누지 않는다", () => {
    const zero = exampleSession({ endedAt: SESSION_START.toISOString(), events: [] });
    expect(timelineSegments(zero)).toEqual([]);
  });

  it("구간이 세션 밖으로 나가도 0~1로만 잘라 바가 깨지지 않게 한다", () => {
    const outOfRange = exampleSession({ events: [event("AWAY", -600, 12_000)] });
    const [segment] = timelineSegments(outOfRange);

    expect(segment!.startRatio).toBe(0);
    expect(segment!.widthRatio).toBe(1);
  });
});

describe("toSessionResultView", () => {
  it("서버 값을 보정하지 않고 그대로 싣는다", () => {
    const view = toSessionResultView(exampleSession());

    expect(view.focusSec).toBe(5040);
    expect(view.studySec).toBe(6120);
  });

  it("집중률은 정수로 반올림해 보여준다 — 화면에 소수점을 노출하지 않는다", () => {
    expect(toSessionResultView(exampleSession()).focusRatePercent).toBe(82);
  });

  it("0초 세션의 집중률이 유한수가 아니면 0으로 방어한다", () => {
    const broken = exampleSession({ studySec: 0, focusSec: 0, focusRate: Number.NaN });
    expect(toSessionResultView(broken).focusRatePercent).toBe(0);
  });

  it("비집중 합계에서 일시정지를 제외한다 — 18분(1080초)이지 21분이 아니다", () => {
    expect(toSessionResultView(exampleSession()).distractionSec).toBe(1080);
  });

  it("비집중 행 순서를 자리 이탈 → 휴대폰 사용 → 기기 조작으로 고정한다", () => {
    expect(toSessionResultView(exampleSession()).distractions.map((t) => t.status)).toEqual([
      "AWAY",
      "PHONE",
      "DEVICE",
    ]);
  });

  it("0회인 비집중 유형은 행에서 빠진다 — 0회 행 시안이 없다", () => {
    const onlyAway = exampleSession({ events: [event("AWAY", 60, 100)] });
    expect(toSessionResultView(onlyAway).distractions.map((t) => t.status)).toEqual(["AWAY"]);
  });

  it("일시정지가 0건이면 pause는 null이다 — 행·범례·세그먼트가 전부 사라진다", () => {
    const noPause = exampleSession({ events: [event("AWAY", 60, 100)] });
    expect(toSessionResultView(noPause).pause).toBeNull();
  });

  it("시각 범위는 벽시계라 총 공부 시간과 다를 수 있다", () => {
    const view = toSessionResultView(exampleSession());

    expect(view.clockRange).toBe("21:03 – 22:48"); // 105분
    expect(view.studySec).toBe(6120); // 102분 — 일시정지 3분 제외
  });
});

describe("timelineSummaryLabel", () => {
  it("바의 시각 정보를 텍스트로 요약한다", () => {
    expect(timelineSummaryLabel(toSessionResultView(exampleSession()))).toBe(
      "집중 1시간 24분, 비집중 18분, 일시정지 3분",
    );
  });

  it("일시정지가 없으면 읽지 않는다", () => {
    const noPause = exampleSession({ events: [event("AWAY", 60, 600)] });
    expect(timelineSummaryLabel(toSessionResultView(noPause))).toBe("집중 1시간 24분, 비집중 10분");
  });
});
