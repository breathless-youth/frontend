import { expect, it } from "vitest";
import type { PlannerRecordRange } from "@focusmakers/types";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { createRecordDraft, recordDraftOperations, stageRecordRange } from "../recordDraft";

const base = Date.parse("2026-11-06T03:00:00Z");
const at = (minute: number) => new Date(base + minute * 60_000).toISOString();
const range = (from: number, to: number, subjectId?: number): PlannerRecordRange => ({
  startedAt: at(from),
  endedAt: at(to),
  ...(subjectId === undefined ? { change: "DELETE" } : { change: "SUBJECT", subjectId }),
});

// Regression: BY-1205-QA-001 — 빈칸만 남은 범위 때문에 부모의 전체 저장이 stale이 되는 문제.
// Found by /qa on 2026-11-09; BE PR163의 모든 범위 교차 검증과 대조해 재현했다.
it("넓게 칠한 뒤 실제 양끝을 지우면 원래 빈 분의 과목 변경은 전송하지 않는다", () => {
  const record = plannerRecord({
    revision: 0,
    startedAt: at(0),
    endedAt: at(3),
    pieces: [
      { startedAt: at(0), endedAt: at(1), subjectId: 3 },
      { startedAt: at(2), endedAt: at(3), subjectId: 4 },
    ],
  });
  let draft = createRecordDraft(plannerDay({ records: [record] }));
  draft = stageRecordRange(draft, record.key, range(0, 3, 7));
  draft = stageRecordRange(draft, record.key, range(0, 1));
  draft = stageRecordRange(draft, record.key, range(2, 3));
  expect(recordDraftOperations(draft)[0]?.ranges).toEqual([range(0, 1), range(2, 3)]);
});

it("원래 빈 분에만 걸친 조각을 제외한 최종 유효 범위 100개까지 저장한다", () => {
  const record = plannerRecord({
    revision: 0,
    startedAt: at(0),
    endedAt: at(199),
    pieces: Array.from({ length: 100 }, (_, index) => ({
      startedAt: at(index * 2),
      endedAt: at(index * 2 + 1),
      subjectId: 3,
    })),
  });
  let draft = createRecordDraft(plannerDay({ records: [record] }));
  draft = stageRecordRange(draft, record.key, range(0, 199, 7));
  for (let index = 0; index < 100; index++)
    draft = stageRecordRange(draft, record.key, range(index * 2, index * 2 + 1));
  expect(recordDraftOperations(draft)[0]?.ranges).toEqual(
    Array.from({ length: 100 }, (_, index) => range(index * 2, index * 2 + 1)),
  );
});
