import { expect, it } from "vitest";
import { plannerDay, plannerRecord, plannerSubject } from "@/test/plannerFixtures";
import { plannerPlanDay, plannerRecordPaints } from "../plannerPlanDay";
import { plannerCellFills, plannerDayWindow } from "../plannerDay";
import {
  createRecordDraft,
  recordDraftDurationSec,
  recordDraftOperations,
} from "../record-edit/recordDraft";

it("pieces의 대표 분과 빈칸을 표시하고 기존 공부·순공 집계를 유지한다", () => {
  const day = plannerPlanDay(
    plannerDay({
      date: "2026-11-09",
      studySec: 12,
      focusSec: 7,
      records: [
        plannerRecord({
          startedAt: "2026-11-09T03:00:00Z",
          endedAt: "2026-11-09T03:02:37.5Z",
          revision: 0,
          pieces: [
            { startedAt: "2026-11-09T03:00:00Z", endedAt: "2026-11-09T03:00:20Z", subjectId: 3 },
            { startedAt: "2026-11-09T03:00:20Z", endedAt: "2026-11-09T03:01:00Z", subjectId: 5 },
            {
              startedAt: "2026-11-09T03:02:00Z",
              endedAt: "2026-11-09T03:02:37.5Z",
              subjectId: null,
            },
          ],
        }),
      ],
    }),
  );
  expect(day.paints).toEqual([
    {
      startMs: Date.parse("2026-11-09T03:00:00Z"),
      endMs: Date.parse("2026-11-09T03:01:00Z"),
      kind: "subject",
      subjectId: 5,
      manual: false,
    },
    {
      startMs: Date.parse("2026-11-09T03:02:00Z"),
      endMs: Date.parse("2026-11-09T03:03:00Z"),
      kind: "focus",
      manual: false,
    },
  ]);
  expect([day.studySec, day.focusSec]).toEqual([12, 7]);
  expect(
    plannerRecordPaints(
      plannerRecord({ pieces: [] }),
      plannerDayWindow("2026-11-09", "Asia/Seoul"),
    ),
  ).toEqual([]);
});

it("개인 집계를 보존하고 10분 칸의 중간부터 1분 단위로 칠한다", () => {
  const day = plannerPlanDay(
    plannerDay({
      date: "2026-11-06",
      focusSec: 901,
      studySec: 960,
      subjects: [plannerSubject({ focusSec: 901 })],
      records: [
        plannerRecord({
          startedAt: "2026-11-06T00:12:20Z",
          endedAt: "2026-11-06T00:28:03Z",
          subjectSegments: [
            {
              subjectId: 3,
              startedAt: "2026-11-06T00:12:20Z",
              endedAt: "2026-11-06T00:28:03Z",
              focusSec: 901,
              studySec: 960,
            },
          ],
        }),
      ],
    }),
  );
  expect(day.focusSec).toBe(901);
  const cells = plannerCellFills(day);
  expect(cells[25]).toMatchObject([
    { left: 0.3, width: 0.7, startsBlock: true, paint: { kind: "subject", subjectId: 3 } },
  ]);
  expect(cells[26]).toMatchObject([{ left: 0, width: 0.9, startsBlock: false }]);
  expect(cells[27]).toEqual([]);
});

it("같은 분으로 올림된 짧은 기록도 실제 기록이 있던 1분 칸에 보이고 원본·초안·집계는 보존한다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-03T13:29:49.686000Z",
    endedAt: "2026-11-03T13:29:53.341000Z",
    fullStartedAt: "2026-11-03T13:29:49.686000Z",
    fullEndedAt: "2026-11-03T13:29:53.341000Z",
    studySec: 4,
    focusSec: 3,
    subjectSegments: [],
  });
  const original = structuredClone(record);
  const plan = plannerDay({ date: "2026-11-03", studySec: 4, focusSec: 3, records: [record] });
  const draft = createRecordDraft(plan);
  const day = plannerPlanDay(plan);
  expect(day.paints).toEqual([
    {
      startMs: Date.parse("2026-11-03T13:29:00Z"),
      endMs: Date.parse("2026-11-03T13:30:00Z"),
      manual: false,
      kind: "focus",
    },
  ]);
  expect(day.studySec).toBe(4);
  expect(day.focusSec).toBe(3);
  expect(record).toEqual(original);
  expect(draft.blocks[0]).toMatchObject({
    startMs: Date.parse("2026-11-03T13:30:00Z"),
    endMs: Date.parse("2026-11-03T13:30:00Z"),
    preciseStartedAt: original.startedAt,
    preciseEndedAt: original.endedAt,
  });
  expect(recordDraftDurationSec(draft.blocks[0]!)).toBe(4);
  expect(recordDraftOperations(draft)).toEqual([]);
});

it.each([
  [
    "05시 시작",
    "2026-11-02T20:00:12Z",
    "2026-11-02T20:00:20Z",
    "2026-11-02T20:00:00Z",
    "2026-11-02T20:01:00Z",
  ],
  [
    "다음 날 자정",
    "2026-11-03T14:59:49Z",
    "2026-11-03T14:59:53Z",
    "2026-11-03T14:59:00Z",
    "2026-11-03T15:00:00Z",
  ],
  [
    "조회 창 마지막 분",
    "2026-11-03T19:59:49Z",
    "2026-11-03T19:59:53Z",
    "2026-11-03T19:59:00Z",
    "2026-11-03T20:00:00Z",
  ],
  [
    "05시 시작을 걸친 조각",
    "2026-11-02T19:59:59Z",
    "2026-11-02T20:00:10Z",
    "2026-11-02T20:00:00Z",
    "2026-11-02T20:01:00Z",
  ],
  [
    "05시 종료를 걸친 조각",
    "2026-11-03T19:59:59Z",
    "2026-11-03T20:00:10Z",
    "2026-11-03T19:59:00Z",
    "2026-11-03T20:00:00Z",
  ],
])(
  "%s의 짧은 기록은 해당 조회 창 안의 1분만 칠한다",
  (_, startedAt, endedAt, visualStart, visualEnd) => {
    const window = plannerDayWindow("2026-11-03", "Asia/Seoul");
    const paints = plannerRecordPaints(
      plannerRecord({ startedAt, endedAt, subjectSegments: [] }),
      window,
    );
    expect(paints).toHaveLength(1);
    expect(paints[0]).toMatchObject({
      startMs: Date.parse(visualStart),
      endMs: Date.parse(visualEnd),
    });
    expect(paints[0]!.startMs).toBeGreaterThanOrEqual(window.startMs);
    expect(paints[0]!.endMs).toBeLessThanOrEqual(window.endMs);
  },
);

it("조회 창 밖과 실제 길이 없는 기록에 표시용 1분을 만들지 않는다", () => {
  const window = plannerDayWindow("2026-11-03", "Asia/Seoul");
  for (const [startedAt, endedAt] of [
    ["2026-11-02T19:59:49Z", "2026-11-02T19:59:53Z"],
    ["2026-11-03T20:00:12Z", "2026-11-03T20:00:20Z"],
    ["2026-11-03T13:29:49Z", "2026-11-03T13:29:49Z"],
    ["2026-11-03T13:29:53Z", "2026-11-03T13:29:49Z"],
  ]) {
    expect(
      plannerRecordPaints(plannerRecord({ startedAt, endedAt, subjectSegments: [] }), window),
    ).toEqual([]);
  }
});

it.each(["MEASURED", "MANUAL"] as const)(
  "짧은 %s 기록의 과목과 출처도 표시 영역에 유지한다",
  (source) => {
    const startedAt = "2026-11-03T13:29:49.686000Z";
    const endedAt = "2026-11-03T13:29:53.341000Z";
    const record = plannerRecord({
      source,
      startedAt,
      endedAt,
      subjectSegments: [{ subjectId: 3, startedAt, endedAt, studySec: 4, focusSec: 3 }],
    });
    expect(plannerRecordPaints(record, plannerDayWindow("2026-11-03", "Asia/Seoul"))).toEqual([
      {
        startMs: Date.parse("2026-11-03T13:29:00Z"),
        endMs: Date.parse("2026-11-03T13:30:00Z"),
        manual: source === "MANUAL",
        kind: "subject",
        subjectId: 3,
      },
    ]);
  },
);
