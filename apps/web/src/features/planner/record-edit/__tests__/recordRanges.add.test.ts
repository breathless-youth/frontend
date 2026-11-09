import { expect, it } from "vitest";
import { applyRecordRanges, normalizeRecordRanges } from "../recordRanges";
import type { PlannerRecordRange } from "@focusmakers/types";

const at = (min: number) => `2026-11-06T00:${String(min).padStart(2, "0")}:00.000Z`;
const add = (from: number, to: number, subjectId: number | null): PlannerRecordRange => ({
  startedAt: at(from),
  endedAt: at(to),
  change: "ADD",
  subjectId,
});
const del = (from: number, to: number): PlannerRecordRange => ({
  startedAt: at(from),
  endedAt: at(to),
  change: "DELETE",
});
const pieces = [
  { startedAt: at(1), endedAt: "2026-11-06T00:01:04.000Z", subjectId: 1 },
  { startedAt: at(3), endedAt: at(5), subjectId: 2 },
];

it("ADD는 범위를 그 과목 조각 하나로 만들어 빈 곳은 채우고 있는 조각은 바꾼다", () => {
  expect(applyRecordRanges(pieces, [add(0, 1, 1)])).toEqual([
    { startedAt: at(0), endedAt: at(1), subjectId: 1 },
    pieces[0],
    pieces[1],
  ]);
  expect(applyRecordRanges(pieces, [add(4, 6, 1)])).toEqual([
    pieces[0],
    { startedAt: at(3), endedAt: at(4), subjectId: 2 },
    { startedAt: at(4), endedAt: at(6), subjectId: 1 },
  ]);
});

it("ADD는 조각이 없는 범위여도 서버 전송 목록에 남고 뒤의 ADD가 앞의 DELETE를 덮는다", () => {
  expect(normalizeRecordRanges([add(6, 8, null)], pieces)).toEqual([add(6, 8, null)]);
  expect(normalizeRecordRanges([del(3, 5), add(3, 4, 1)], pieces)).toEqual([
    add(3, 4, 1),
    del(4, 5),
  ]);
});

it("늘린 뒤 과목을 바꾸면 늘린 부분은 새 과목의 ADD로 남고 나머지는 SUBJECT가 된다", () => {
  const base = [{ startedAt: at(0), endedAt: at(2), subjectId: 3 }];
  const ranges = normalizeRecordRanges(
    [add(2, 5, 3), { startedAt: at(0), endedAt: at(5), change: "SUBJECT", subjectId: 4 }],
    base,
  );
  expect(ranges).toEqual([
    { startedAt: at(0), endedAt: at(2), change: "SUBJECT", subjectId: 4 },
    add(2, 5, 4),
  ]);
  expect(applyRecordRanges(base, ranges)).toEqual([
    { startedAt: at(0), endedAt: at(2), subjectId: 4 },
    { startedAt: at(2), endedAt: at(5), subjectId: 4 },
  ]);
});
