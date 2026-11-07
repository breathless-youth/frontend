import { expect, it } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { createRecordDraft, recordDraftOperations } from "../recordDraft";

const at = (hour: string) => `2026-11-06T${hour}:00.000Z`;

it("화면에서는 닿아 보이는 옛 기록의 소수 밀리초 겹침도 먼저 비운다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: [
        plannerRecord({
          key: "first",
          startedAt: at("01:00"),
          endedAt: "2026-11-06T02:00:00.000001Z",
          subjectSegments: [],
        }),
        plannerRecord({
          key: "second",
          startedAt: at("02:00"),
          endedAt: at("03:00"),
          subjectSegments: [],
        }),
      ],
    }),
  );
  const first = { ...draft.blocks[0]!, endMs: Date.parse(at("01:59")) };
  draft.blocks = [{ ...draft.blocks[1]!, endMs: Date.parse(at("03:30")) }, first];
  expect(recordDraftOperations(draft).map((operation) => operation.blockId)).toEqual([
    "first",
    "second",
  ]);
});

it.each(["MEASURED", "MANUAL"] as const)(
  "%s 과목 없는 두 기록의 경계를 옮기면 먼저 공간을 비운 뒤 늘린다",
  (source) => {
    const draft = createRecordDraft(
      plannerDay({
        records: [
          plannerRecord({
            key: "first",
            source,
            startedAt: at("01:00"),
            endedAt: at("02:00"),
            subjectSegments: [],
          }),
          plannerRecord({
            key: "second",
            source,
            startedAt: at("02:00"),
            endedAt: at("03:00"),
            subjectSegments: [],
          }),
        ],
      }),
    );
    draft.blocks = draft.blocks.map((block) =>
      block.id === "first"
        ? { ...block, endMs: Date.parse(at("02:30")) }
        : { ...block, startMs: Date.parse(at("02:30")) },
    );
    const occupied = new Map(
      [...draft.baseline].map(([id, block]) => [id, { start: block.startMs, end: block.endMs }]),
    );
    const operations = recordDraftOperations(draft);
    // 운영 서버와 같이 각 작업을 현재 저장된 구간에 대해 순서대로 검증한다.
    for (const operation of operations) {
      const start = Date.parse(operation.startedAt!);
      const end = Date.parse(operation.endedAt!);
      const overlaps = [...occupied].some(
        ([id, span]) => id !== operation.blockId && span.start < end && span.end > start,
      );
      expect(overlaps).toBe(false);
      occupied.set(operation.blockId, { start, end });
    }
    expect(occupied.get("first")).toEqual({
      start: Date.parse(at("01:00")),
      end: Date.parse(at("02:30")),
    });
    expect(occupied.get("second")).toEqual({
      start: Date.parse(at("02:30")),
      end: Date.parse(at("03:00")),
    });
  },
);

it("여러 기록을 뒤로 옮길 때 의존하는 구간부터 비우고 새 기록을 만든다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: ["01:00", "02:00", "03:00"].map((start, index) =>
        plannerRecord({
          key: String(index),
          startedAt: at(start),
          endedAt: at(`0${index + 2}:00`),
          subjectSegments: [],
        }),
      ),
    }),
  );
  draft.blocks = draft.blocks.map((block) => ({
    ...block,
    startMs: block.startMs + 3600000,
    endMs: block.endMs + 3600000,
  }));
  const template = draft.blocks[0]!;
  draft.blocks.unshift({
    ...template,
    id: "new",
    key: null,
    startMs: Date.parse(at("01:00")),
    endMs: Date.parse(at("02:00")),
  });
  expect(recordDraftOperations(draft).map((operation) => operation.blockId)).toEqual([
    "2",
    "1",
    "0",
    "new",
  ]);
});
