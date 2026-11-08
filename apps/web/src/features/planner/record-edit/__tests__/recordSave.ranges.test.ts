import { afterEach, expect, it, vi } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import {
  createRecordDraft,
  recordDraftOperations,
  stageRecordRange,
  addRecordDraft,
} from "../recordDraft";
import {
  acceptSavedRecords,
  rebaseRecordDraft,
  recordSaveFailure,
  saveRecordDraft,
} from "../recordSave";

const piece = {
  startedAt: "2026-11-06T00:00:00Z",
  endedAt: "2026-11-06T00:02:37.500001Z",
  subjectId: 3,
};
const record = plannerRecord({
  revision: 0,
  pieces: [piece],
  startedAt: piece.startedAt,
  endedAt: piece.endedAt,
});
const range = {
  startedAt: piece.startedAt,
  endedAt: "2026-11-06T00:01:00Z",
  change: "SUBJECT" as const,
  subjectId: 7,
};
afterEach(() => vi.unstubAllGlobals());

it("STALE_RECORD는 재시도 대기열에서 빼고 재조회 대상으로 구분한다", async () => {
  const draft = stageRecordRange(
    createRecordDraft(plannerDay({ records: [record] })),
    record.key,
    range,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        results: [
          {
            operationId: body.operations[0].operationId,
            success: false,
            key: record.key,
            status: 409,
            code: "STALE_RECORD",
            message: null,
          },
        ],
      });
    }),
  );
  const result = await saveRecordDraft(recordDraftOperations(draft), { timeZone: draft.timeZone });
  expect(result.pending).toEqual([]);
  expect(result.staleKeys).toEqual([record.key]);
  expect(result.uncertain).toBe(false);
  expect(recordSaveFailure(result)).toBe("stale");
});

it("범위 저장 응답이 유실되면 revision과 범위를 포함한 같은 본문으로 재전송한다", async () => {
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) throw new TypeError("network");
      const body = JSON.parse(bodies.at(-1)!);
      return Response.json({
        results: [
          {
            operationId: body.operations[0].operationId,
            success: true,
            key: record.key,
            revision: 1,
            status: 200,
            code: null,
            message: null,
          },
        ],
      });
    }),
  );
  const draft = stageRecordRange(
    createRecordDraft(plannerDay({ records: [record] })),
    record.key,
    range,
  );
  const first = await saveRecordDraft(recordDraftOperations(draft), { timeZone: draft.timeZone });
  const result = await saveRecordDraft(first.pending, { timeZone: draft.timeZone });
  expect(bodies[1]).toBe(bodies[0]);
  const accepted = acceptSavedRecords(draft, result);
  expect(recordDraftOperations(accepted)).toEqual([]);
  expect(accepted.blocks[0]?.original).toMatchObject({
    revision: 1,
    pieces: [
      { startedAt: piece.startedAt, endedAt: range.endedAt, subjectId: 7 },
      { startedAt: range.endedAt, endedAt: piece.endedAt, subjectId: 3 },
    ],
  });
});

it("stale 부모만 canonical로 교체하고 다른 부모의 미저장 범위와 새 기록은 유지한다", () => {
  const other = plannerRecord({ ...record, key: "other" });
  let draft = createRecordDraft(plannerDay({ records: [record, other] }));
  draft = stageRecordRange(stageRecordRange(draft, record.key, range), other.key, range);
  draft = addRecordDraft(
    draft,
    {
      id: "new",
      startMs: Date.parse("2026-11-06T01:00:00Z"),
      endMs: Date.parse("2026-11-06T01:01:00Z"),
      subjectId: null,
    },
    Date.parse("2026-11-06T02:00:00Z"),
  );
  const rebased = rebaseRecordDraft(
    draft,
    plannerDay({ records: [{ ...record, revision: 1, pieces: [] }, other] }),
    [record.key],
  );
  expect(rebased.blocks.find((b) => b.key === record.key)?.ranges).toBeUndefined();
  expect(rebased.blocks.find((b) => b.key === record.key)?.original?.revision).toBe(1);
  expect(recordDraftOperations(rebased).map((op) => op.blockId)).toEqual([other.key, "new"]);
});
