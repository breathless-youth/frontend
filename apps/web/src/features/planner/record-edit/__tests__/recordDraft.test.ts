import { expect, it } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import {
  createRecordDraft,
  recordDraftOperations,
  addRecordDraft,
  changeRecordDraft,
  deleteRecordDraft,
  firstRecordDraftMinute,
} from "../recordDraft";
const minute = (value: string) => Date.parse(`2026-11-06T${value}:00+09:00`);
it("키보드 추가는 겹치지 않는 첫 1분을 찾고 현재 시각 전의 빈 분이 없으면 추가하지 않는다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: [
        plannerRecord({
          startedAt: "2026-11-05T20:00:00Z",
          endedAt: "2026-11-05T21:00:00Z",
          subjectSegments: [],
        }),
        plannerRecord({
          key: "m:later",
          startedAt: "2026-11-05T21:01:00Z",
          endedAt: "2026-11-05T22:00:00Z",
          subjectSegments: [],
        }),
      ],
    }),
  );
  expect(firstRecordDraftMinute(draft, minute("12:00"))).toEqual({
    startMs: minute("06:00"),
    endMs: minute("06:01"),
  });
  expect(firstRecordDraftMinute(draft, minute("06:00"))).toBeNull();
  expect(recordDraftOperations(draft)).toEqual([]);
});
it("표시를 1분 올림해도 손대지 않은 원본에는 저장 작업이 없다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: [
        plannerRecord({ startedAt: "2026-11-06T00:12:20Z", endedAt: "2026-11-06T00:28:03Z" }),
      ],
    }),
  );
  expect(draft.blocks[0]?.startMs).toBe(minute("09:13"));
  expect(draft.blocks[0]?.endMs).toBe(minute("09:29"));
  expect(recordDraftOperations(draft)).toEqual([]);
});
it("새로 만들었다 삭제한 기록은 저장하지 않고 여러 변경은 마지막 시간 한 건만 저장한다", () => {
  let draft = createRecordDraft(plannerDay());
  draft = addRecordDraft(
    draft,
    { id: "new", startMs: minute("09:13"), endMs: minute("09:29"), subjectId: 3 },
    minute("12:00"),
  );
  draft = changeRecordDraft(draft, "new", { endMs: minute("09:30") }, minute("12:00"));
  const operations = recordDraftOperations(draft);
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({
    action: "CREATE",
    startedAt: "2026-11-06T00:13:00.000Z",
    endedAt: "2026-11-06T00:30:00.000Z",
    subjectId: 3,
    timeZone: "Asia/Seoul",
  });
  draft = deleteRecordDraft(draft, "new");
  expect(recordDraftOperations(draft)).toEqual([]);
});
it.each([
  { start: "09:29", end: "09:28", error: "range" },
  { start: "11:59", end: "12:01", error: "future" },
  { start: "09:59", end: "10:01", error: "overlap" },
  { start: "04:59", end: "05:01", error: "range" },
])("기록의 $error 조건은 초안에 넣지 않는다", ({ start, end, error }) => {
  const draft = createRecordDraft(plannerDay({ records: [plannerRecord()] }));
  expect(() =>
    addRecordDraft(
      draft,
      { id: "new", startMs: minute(start), endMs: minute(end), subjectId: null },
      minute("12:00"),
    ),
  ).toThrow(error);
  expect(draft.blocks).toHaveLength(1);
});
it("05시 경계에서 잘렸을 수 있는 원본은 부분 시간으로 수정하거나 삭제하지 않는다", () => {
  const draft = createRecordDraft(
    plannerDay({ records: [plannerRecord({ startedAt: "2026-11-05T20:00:00Z" })] }),
  );
  expect(() =>
    changeRecordDraft(draft, draft.blocks[0]!.id, { endMs: minute("10:01") }, minute("12:00")),
  ).toThrow("boundary");
  expect(() => deleteRecordDraft(draft, draft.blocks[0]!.id)).toThrow("boundary");
});

it("과목이 없는 구간도 있는 묶음은 과목을 고르기 전 시간 변경으로 덮어쓰지 않는다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: [
        plannerRecord({
          subjectSegments: [
            {
              subjectId: 3,
              startedAt: "2026-11-06T00:15:00Z",
              endedAt: "2026-11-06T01:00:00Z",
              focusSec: 2400,
              studySec: 2700,
            },
          ],
        }),
      ],
    }),
  );
  const id = draft.blocks[0]!.id;
  expect(() => changeRecordDraft(draft, id, { endMs: minute("10:01") }, minute("12:00"))).toThrow(
    "subject-required",
  );
  const chosen = changeRecordDraft(draft, id, { subjectId: null }, minute("12:00"));
  expect(() =>
    changeRecordDraft(chosen, id, { endMs: minute("10:01") }, minute("12:00")),
  ).not.toThrow();
});

it("과목만 바꿀 때 초와 소수초를 보존하도록 시각을 생략한다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-06T00:12:20.123456Z",
    endedAt: "2026-11-06T00:28:03.654321Z",
    fullStartedAt: "2026-11-06T00:12:20.123456Z",
    fullEndedAt: "2026-11-06T00:28:03.654321Z",
    subjectSegments: [],
  });
  const draft = createRecordDraft(plannerDay({ records: [record] }));
  const changed = changeRecordDraft(draft, record.key, { subjectId: 4 }, minute("12:00"));
  const operation = recordDraftOperations(changed)[0]!;
  expect(operation).toMatchObject({ action: "UPDATE", subjectId: 4 });
  expect(operation).not.toHaveProperty("startedAt");
  expect(operation).not.toHaveProperty("endedAt");
});

it("05시를 걸친 전체 구간을 편집하고 바꾸지 않은 경계 문자열을 보존한다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-05T20:00:00Z",
    endedAt: "2026-11-05T21:00:00Z",
    fullStartedAt: "2026-11-05T19:30:12.123456Z",
    fullEndedAt: "2026-11-05T21:00:03.654321Z",
    subjectSegments: [],
  });
  const draft = createRecordDraft(plannerDay({ records: [record] }));
  expect(draft.blocks[0]?.locked).toBe(false);
  const chosen = changeRecordDraft(draft, record.key, { subjectId: null }, minute("12:00"));
  const changed = changeRecordDraft(
    chosen,
    record.key,
    { endMs: minute("06:10") },
    minute("12:00"),
  );
  expect(recordDraftOperations(changed)[0]).toMatchObject({
    startedAt: record.fullStartedAt,
    endedAt: "2026-11-05T21:10:00.000Z",
  });
  expect(recordDraftOperations(deleteRecordDraft(draft, record.key))[0]).toMatchObject({
    action: "DELETE",
    key: record.key,
  });
});

it("1분 미만 기록도 과목만 변경할 수 있다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-06T00:12:20Z",
    endedAt: "2026-11-06T00:12:40Z",
    fullStartedAt: "2026-11-06T00:12:20Z",
    fullEndedAt: "2026-11-06T00:12:40Z",
    subjectSegments: [],
  });
  const draft = createRecordDraft(plannerDay({ records: [record] }));
  const changed = changeRecordDraft(draft, record.key, { subjectId: 4 }, minute("12:00"));
  expect(recordDraftOperations(changed)[0]).not.toHaveProperty("startedAt");
});
it("이미 끝난 원본의 시작만 바꿀 때 종료 표시 올림이 미래 검사를 막지 않는다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-06T02:30:00Z",
    endedAt: "2026-11-06T03:00:20.123456Z",
    fullStartedAt: "2026-11-06T02:30:00Z",
    fullEndedAt: "2026-11-06T03:00:20.123456Z",
    subjectSegments: [],
  });
  const draft = createRecordDraft(plannerDay({ records: [record] }));
  const changed = changeRecordDraft(
    draft,
    record.key,
    { startMs: minute("11:29") },
    minute("12:00") + 50_000,
  );
  expect(recordDraftOperations(changed)[0]).toMatchObject({
    startedAt: "2026-11-06T02:29:00.000Z",
    endedAt: record.fullEndedAt,
  });
});
it("현재보다 늦은 종료 원본과 새 기록은 여전히 미래로 거절한다", () => {
  const now = minute("12:00") + 20_000;
  const record = plannerRecord({
    startedAt: "2026-11-06T02:30:00Z",
    endedAt: "2026-11-06T03:00:50Z",
    fullStartedAt: "2026-11-06T02:30:00Z",
    fullEndedAt: "2026-11-06T03:00:50Z",
    subjectSegments: [],
  });
  const draft = createRecordDraft(plannerDay({ records: [record] }));
  expect(() => changeRecordDraft(draft, record.key, { startMs: minute("11:29") }, now)).toThrow(
    "future",
  );
  expect(() =>
    addRecordDraft(
      createRecordDraft(plannerDay()),
      { id: "new", startMs: minute("11:59"), endMs: minute("12:01"), subjectId: null },
      now,
    ),
  ).toThrow("future");
});

it.each([
  {
    date: "2026-11-05",
    start: "2026-11-05T19:30:00Z",
    end: "2026-11-05T20:00:00Z",
    patch: { startMs: Date.parse("2026-11-05T19:20:00Z") },
  },
  {
    date: "2026-11-06",
    start: "2026-11-05T20:00:00Z",
    end: "2026-11-05T21:00:00Z",
    patch: { endMs: Date.parse("2026-11-05T21:10:00Z") },
  },
])(
  "경계 밖 측정 기록은 $date 에서 과목을 직접 선택한 뒤에만 시간을 바꾼다",
  ({ date, start, end, patch }) => {
    const record = plannerRecord({
      startedAt: start,
      endedAt: end,
      fullStartedAt: "2026-11-05T19:30:00Z",
      fullEndedAt: "2026-11-05T21:00:00Z",
      subjectSegments: [{ subjectId: 3, startedAt: start, endedAt: end, studySec: 1, focusSec: 1 }],
    });
    const draft = createRecordDraft(plannerDay({ date, records: [record] }));
    expect(draft.blocks[0]!.mixed).toBe(true);
    expect(() => changeRecordDraft(draft, record.key, patch, minute("12:00"))).toThrow(
      "subject-required",
    );
    const chosen = changeRecordDraft(draft, record.key, { subjectId: 3 }, minute("12:00"));
    const changed = changeRecordDraft(chosen, record.key, patch, minute("12:00"));
    expect(recordDraftOperations(changed)[0]).toMatchObject({ action: "UPDATE", subjectId: 3 });
  },
);

it("경계 밖 과목을 모르는 경우 보이는 구간에 과목이 없어도 명시적으로 선택해야 한다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-05T20:00:00Z",
    endedAt: "2026-11-05T21:00:00Z",
    fullStartedAt: "2026-11-05T19:30:00Z",
    fullEndedAt: "2026-11-05T21:00:00Z",
    subjectSegments: [],
  });
  const draft = createRecordDraft(plannerDay({ records: [record] }));
  expect(() =>
    changeRecordDraft(draft, record.key, { endMs: minute("06:10") }, minute("12:00")),
  ).toThrow("subject-required");
  const unsafeDraft = {
    ...draft,
    blocks: draft.blocks.map((block) => ({ ...block, endMs: minute("06:10") })),
  };
  expect(() => recordDraftOperations(unsafeDraft)).toThrow("subject-required");
  const chosen = changeRecordDraft(draft, record.key, { subjectId: null }, minute("12:00"));
  const changed = changeRecordDraft(
    chosen,
    record.key,
    { endMs: minute("06:10") },
    minute("12:00"),
  );
  expect(recordDraftOperations(changed)[0]).toMatchObject({ subjectId: null });
});

it("경계 밖 수동 기록과 전체가 보이는 단일 과목 측정 기록은 기존처럼 시간만 바꾼다", () => {
  const manual = plannerRecord({
    source: "MANUAL",
    startedAt: "2026-11-05T20:00:00Z",
    endedAt: "2026-11-05T21:00:00Z",
    fullStartedAt: "2026-11-05T19:30:00Z",
    fullEndedAt: "2026-11-05T21:00:00Z",
    subjectSegments: [],
  });
  const manualDraft = createRecordDraft(plannerDay({ records: [manual] }));
  expect(() =>
    changeRecordDraft(manualDraft, manual.key, { endMs: minute("06:10") }, minute("12:00")),
  ).not.toThrow();
  const measured = plannerRecord();
  const measuredDraft = createRecordDraft(plannerDay({ records: [measured] }));
  expect(() =>
    changeRecordDraft(measuredDraft, measured.key, { endMs: minute("10:10") }, minute("12:00")),
  ).not.toThrow();
});
