import { expect, it } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { applyRecordRanges, normalizeRecordRanges, recordRangeCoverageSec } from "../recordRanges";
import {
  addRecordDraft,
  createRecordDraft,
  recordDraftOperations,
  stageRecordRange,
} from "../recordDraft";
import type { PlannerRecordRange } from "@focusmakers/types";

const at = (min: number) => `2026-11-06T00:${String(min).padStart(2, "0")}:00.000Z`;
const range = (from: number, to: number, subjectId?: number | null): PlannerRecordRange => ({
  startedAt: at(from),
  endedAt: at(to),
  ...(subjectId === undefined ? { change: "DELETE" } : { change: "SUBJECT", subjectId }),
});
const pieces = [
  { startedAt: at(0), endedAt: "2026-11-06T00:00:20.000000001Z", subjectId: 1 },
  { startedAt: "2026-11-06T00:00:20.000000001Z", endedAt: at(3), subjectId: 2 },
  { startedAt: at(4), endedAt: "2026-11-06T00:04:37.500000001Z", subjectId: null },
];

it("후속 변경으로 앞 범위를 자르고 같은 변경만 인접 병합한다", () => {
  expect(
    normalizeRecordRanges([range(0, 4, 7), range(1, 2), range(2, 3, null), range(3, 5, 7)]),
  ).toEqual([range(0, 1, 7), range(1, 2), range(2, 3, null), range(3, 5, 7)]);
  expect(normalizeRecordRanges([range(0, 1, 7), range(1, 2, 7)])).toEqual([range(0, 2, 7)]);
});

it("선택 분 안의 모든 과목을 바꾸고 조각 정밀도와 삭제 빈칸을 보존한다", () => {
  const result = applyRecordRanges(pieces, [range(0, 1, 7), range(1, 2), range(4, 5, 7)]);
  expect(result).toEqual([
    { ...pieces[0], subjectId: 7 },
    { startedAt: pieces[1]!.startedAt, endedAt: at(1), subjectId: 7 },
    { startedAt: at(2), endedAt: at(3), subjectId: 2 },
    { ...pieces[2], subjectId: 7 },
  ]);
  expect(recordRangeCoverageSec(result, Date.parse(at(4)), Date.parse(at(5)))).toBe(38);
  expect(applyRecordRanges(pieces, [range(3, 4, null)])).toEqual(pieces);
});

it("같은 부모의 변경을 revision 0인 EDIT_RANGES 하나로 보내고 삭제 분은 재사용한다", () => {
  const record = plannerRecord({ revision: 0, pieces, startedAt: at(0), endedAt: at(5) });
  let draft = createRecordDraft(plannerDay({ records: [record] }));
  draft = stageRecordRange(draft, record.key, range(0, 1, 7));
  draft = stageRecordRange(draft, record.key, range(1, 2));
  draft = stageRecordRange(draft, record.key, range(2, 3, 7));
  const operation = recordDraftOperations(draft)[0];
  expect(operation).toMatchObject({
    action: "EDIT_RANGES",
    key: record.key,
    revision: 0,
    ranges: [range(0, 1, 7), range(1, 2), range(2, 3, 7)],
  });
  expect(operation).not.toHaveProperty("subjectId");
  draft = addRecordDraft(
    draft,
    { id: "new", startMs: Date.parse(at(1)), endMs: Date.parse(at(2)), subjectId: 4 },
    Date.parse(at(10)),
  );
  expect(recordDraftOperations(draft).map((op) => op.action)).toEqual(["EDIT_RANGES", "CREATE"]);
});

it("필드 누락·잘못된 revision·조각 겹침은 전체 기록 수정으로 대체하지 않는다", () => {
  for (const record of [
    plannerRecord(),
    plannerRecord({ revision: -1, pieces }),
    plannerRecord({ revision: 0, pieces: [pieces[0]!, pieces[0]!] }),
  ]) {
    const draft = createRecordDraft(plannerDay({ records: [record] }));
    expect(() => stageRecordRange(draft, record.key, range(0, 1, 7))).toThrow("unavailable");
  }
  const record = plannerRecord({ revision: 0, pieces: [] });
  expect(() =>
    stageRecordRange(
      createRecordDraft(plannerDay({ records: [record] })),
      record.key,
      range(0, 1, 7),
    ),
  ).toThrow("range");
});

it("분 정렬·최대 100개 범위를 검증한다", () => {
  expect(() =>
    normalizeRecordRanges([
      { startedAt: at(0), endedAt: "2026-11-06T00:00:37Z", change: "DELETE" },
    ]),
  ).toThrow("range");
  const ranges = Array.from({ length: 101 }, (_, i): PlannerRecordRange => ({
    startedAt: new Date(Date.parse(at(0)) + i * 120000).toISOString(),
    endedAt: new Date(Date.parse(at(0)) + i * 120000 + 60000).toISOString(),
    change: "DELETE",
  }));
  expect(() => normalizeRecordRanges(ranges)).toThrow("range-limit");
});

it("삭제한 분을 포함해 과목 범위를 넓혀도 초안의 삭제 빈칸을 복구하지 않는다", () => {
  const record = plannerRecord({ revision: 0, pieces, startedAt: at(0), endedAt: at(5) });
  let draft = createRecordDraft(plannerDay({ records: [record] }));
  draft = stageRecordRange(draft, record.key, range(1, 2));
  draft = stageRecordRange(draft, record.key, range(0, 3, 7));
  expect(recordDraftOperations(draft)[0]?.ranges).toEqual([
    range(0, 1, 7),
    range(1, 2),
    range(2, 3, 7),
  ]);
});
