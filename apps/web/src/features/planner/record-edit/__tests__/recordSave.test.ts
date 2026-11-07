import { afterEach, expect, it, vi } from "vitest";
import { saveRecordDraft, acceptSavedRecords } from "../recordSave";
import type { RecordDraftOperation } from "../recordDraft";
import {
  createRecordDraft,
  addRecordDraft,
  changeRecordDraft,
  recordDraftOperations,
} from "../recordDraft";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
afterEach(() => vi.unstubAllGlobals());
const operations: RecordDraftOperation[] = [
  {
    blockId: "A",
    operationId: "first",
    action: "CREATE",
    startedAt: "2026-11-05T00:00:00Z",
    endedAt: "2026-11-05T01:00:00Z",
    subjectId: null,
    timeZone: "Asia/Seoul",
  },
  {
    blockId: "B",
    operationId: "second",
    action: "UPDATE",
    key: "c:old",
    startedAt: "2026-11-05T02:00:00Z",
    endedAt: "2026-11-05T03:00:00Z",
    subjectId: 3,
    timeZone: "Asia/Seoul",
  },
];
it("일부 성공 뒤에는 실패한 작업만 새 operationId로 재시도한다", async () => {
  const bodies: { operations: { operationId: string; action: string }[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return Response.json({
        results: body.operations.map((operation: RecordDraftOperation, index: number) => ({
          operationId: operation.operationId,
          success: bodies.length > 1 || index === 0,
          key: index === 0 ? "m:new" : "c:old",
          status: bodies.length > 1 || index === 0 ? 200 : 409,
          code: bodies.length > 1 || index === 0 ? null : "CONFLICT",
          message: null,
        })),
      });
    }),
  );
  const first = await saveRecordDraft(operations, { timeZone: "Asia/Seoul" });
  expect(first.pending).toHaveLength(1);
  expect(first.pending[0]?.blockId).toBe("B");
  expect(first.pending[0]?.operationId).not.toBe("second");
  expect(first.uncertain).toBe(false);
  await saveRecordDraft(first.pending, { timeZone: "Asia/Seoul" });
  expect(bodies.map((body) => body.operations.map((operation) => operation.action))).toEqual([
    ["CREATE", "UPDATE"],
    ["UPDATE"],
  ]);
  expect(bodies[0]?.operations[0]).not.toHaveProperty("blockId");
});
it("응답이 끊긴 작업은 같은 id와 같은 본문으로만 다시 보낸다", async () => {
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) throw new TypeError("network");
      return Response.json({
        results: [
          {
            operationId: "first",
            success: true,
            key: "m:new",
            status: 200,
            code: null,
            message: null,
          },
        ],
      });
    }),
  );
  const first = await saveRecordDraft([operations[0]!], { timeZone: "Asia/Seoul" });
  expect(first.uncertain).toBe(true);
  expect(first.pending[0]?.operationId).toBe("first");
  const second = await saveRecordDraft(first.pending, { timeZone: "Asia/Seoul" });
  expect(second.pending).toEqual([]);
  expect(bodies[1]).toBe(bodies[0]);
});
it("성공한 새 기록의 반환 key를 보존해 다음 저장에서 다시 생성하지 않는다", async () => {
  let draft = createRecordDraft(plannerDay());
  draft = addRecordDraft(
    draft,
    {
      id: "new",
      startMs: Date.parse("2026-11-06T00:00:00Z"),
      endMs: Date.parse("2026-11-06T01:00:00Z"),
      subjectId: null,
    },
    Date.parse("2026-11-06T03:00:00Z"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        results: [
          {
            operationId: body.operations[0].operationId,
            success: true,
            key: "m:saved",
            status: 201,
            code: null,
            message: null,
          },
        ],
      });
    }),
  );
  const result = await saveRecordDraft(recordDraftOperations(draft), { timeZone: "Asia/Seoul" });
  const saved = acceptSavedRecords(draft, result);
  expect(saved.blocks[0]?.key).toBe("m:saved");
  expect(recordDraftOperations(saved)).toEqual([]);
});
it("부분 저장 뒤 다시 시간 하나를 바꿔도 저장된 반대 경계의 정밀도를 보존한다", () => {
  const record = plannerRecord({
    startedAt: "2026-11-06T00:12:20.123456Z",
    endedAt: "2026-11-06T00:28:03.654321Z",
    fullStartedAt: "2026-11-06T00:12:20.123456Z",
    fullEndedAt: "2026-11-06T00:28:03.654321Z",
    subjectSegments: [],
  });
  let draft = createRecordDraft(plannerDay({ records: [record] }));
  draft = changeRecordDraft(
    draft,
    record.key,
    { subjectId: 4 },
    Date.parse("2026-11-06T03:00:00Z"),
  );
  const operation = recordDraftOperations(draft)[0]!;
  draft = acceptSavedRecords(draft, {
    confirmed: [
      {
        operation,
        result: {
          operationId: operation.operationId,
          success: true,
          key: record.key,
          status: 200,
          code: null,
          message: null,
        },
      },
    ],
    pending: [],
    uncertain: false,
  });
  draft = changeRecordDraft(
    draft,
    record.key,
    { endMs: Date.parse("2026-11-06T00:30:00Z") },
    Date.parse("2026-11-06T03:00:00Z"),
  );
  expect(recordDraftOperations(draft)[0]).toMatchObject({
    startedAt: record.fullStartedAt,
    endedAt: "2026-11-06T00:30:00.000Z",
  });
});
it("과목만 바꾼 응답이 유실되면 시각 없는 동일 본문을 재전송한다", async () => {
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) throw new TypeError("network");
      return Response.json({
        results: [
          {
            operationId: "subject",
            success: true,
            key: "c:old",
            status: 200,
            code: null,
            message: null,
          },
        ],
      });
    }),
  );
  const operation: RecordDraftOperation = {
    blockId: "A",
    operationId: "subject",
    action: "UPDATE",
    key: "c:old",
    subjectId: 4,
    timeZone: "Asia/Seoul",
  };
  const first = await saveRecordDraft([operation], { timeZone: "Asia/Seoul" });
  expect(first.uncertain).toBe(true);
  await saveRecordDraft(first.pending, { timeZone: "Asia/Seoul" });
  expect(bodies[1]).toBe(bodies[0]);
  expect(JSON.parse(bodies[0]!).operations[0]).not.toHaveProperty("startedAt");
  expect(JSON.parse(bodies[0]!).operations[0]).not.toHaveProperty("endedAt");
});

it("51개 중 첫 배치 성공 후 응답이 유실되면 성공 baseline을 보존하고 미확정 본문만 재시도한다", async () => {
  const now = Date.parse("2026-11-06T03:00:00Z");
  const start = Date.parse("2026-11-06T00:00:00Z");
  let draft = createRecordDraft(plannerDay());
  for (let index = 0; index < 51; index++) {
    draft = addRecordDraft(
      draft,
      {
        id: `new-${index}`,
        startMs: start + index * 120000,
        endMs: start + index * 120000 + 60000,
        subjectId: null,
      },
      now,
    );
  }
  const pending = recordDraftOperations(draft);
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = String(init?.body);
      bodies.push(body);
      if (bodies.length === 2) throw new TypeError("response lost after server commit");
      const parsed: { operations: RecordDraftOperation[] } = JSON.parse(body);
      return Response.json({
        results: parsed.operations.map((operation) => ({
          operationId: operation.operationId,
          success: true,
          key: `m:${operation.operationId}`,
          status: 201,
          code: null,
          message: null,
        })),
      });
    }),
  );
  const first = await saveRecordDraft(pending, { timeZone: draft.timeZone });
  expect(first.confirmed).toHaveLength(50);
  expect(first.pending).toEqual([pending[50]]);
  expect(first.uncertain).toBe(true);
  draft = acceptSavedRecords(draft, first);
  const savedBaseline = new Map(draft.baseline);
  expect(savedBaseline.size).toBe(50);
  for (const operation of pending.slice(0, 50)) {
    expect(savedBaseline.get(operation.blockId)).toMatchObject({
      key: `m:${operation.operationId}`,
      preciseStartedAt: operation.startedAt,
      preciseEndedAt: operation.endedAt,
    });
  }
  expect(recordDraftOperations(draft).map((operation) => operation.blockId)).toEqual(["new-50"]);

  const retried = await saveRecordDraft(first.pending, { timeZone: draft.timeZone });
  expect(bodies.map((body) => JSON.parse(body).operations.length)).toEqual([50, 1, 1]);
  expect(bodies[2]).toBe(bodies[1]);
  expect(retried.pending).toEqual([]);
  expect(retried.uncertain).toBe(false);
  draft = acceptSavedRecords(draft, retried);
  expect(draft.blocks).toHaveLength(51);
  expect(draft.baseline.size).toBe(51);
  for (const [id, baseline] of savedBaseline) expect(draft.baseline.get(id)).toEqual(baseline);
  expect(recordDraftOperations(draft)).toEqual([]);
});
