import { expect, it } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { createRecordDraft, recordDraftOperations, stageRecordRange } from "../recordDraft";
import { resizeRecordBlock, selectRecordBlock } from "../recordSelection";

const z = (hm: string) => `2026-11-09T${hm}:00.000Z`;
const draft = () =>
  createRecordDraft(
    plannerDay({
      date: "2026-11-09",
      records: [
        plannerRecord({
          key: "c:mixed",
          revision: 2,
          startedAt: z("01:00"),
          endedAt: z("01:04"),
          fullStartedAt: z("01:00"),
          fullEndedAt: z("01:04"),
          subjectSegments: [],
          pieces: [
            { startedAt: z("01:00"), endedAt: z("01:02"), subjectId: 3 },
            { startedAt: z("01:02"), endedAt: z("01:04"), subjectId: 4 },
          ],
        }),
      ],
    }),
  );
const now = Date.parse("2026-11-09T06:00:00Z");

it("옆 과목을 지운 뒤 그 자리로 늘리면 ADD가 DELETE를 덮어 서버에 겹치지 않게 보낸다", () => {
  const base = draft();
  const id = base.blocks[0]!.id;
  const deleted = stageRecordRange(base, id, {
    startedAt: z("01:02"),
    endedAt: z("01:04"),
    change: "DELETE",
  });
  const selection = selectRecordBlock(deleted, id, Date.parse(z("01:00")));
  if (selection?.kind !== "range") throw new Error("range selection expected");
  expect(selection).toMatchObject({
    startMs: Date.parse(z("01:00")),
    endMs: Date.parse(z("01:02")),
  });
  const resized = resizeRecordBlock(deleted, selection, { endMs: Date.parse(z("01:03")) }, now);
  expect(recordDraftOperations(resized.draft)[0]).toMatchObject({
    action: "EDIT_RANGES",
    ranges: [
      { startedAt: z("01:02"), endedAt: z("01:03"), change: "ADD", subjectId: 3 },
      { startedAt: z("01:03"), endedAt: z("01:04"), change: "DELETE" },
    ],
  });
});

it("미래 시각까지 늘리면 future로 거절한다", () => {
  const base = draft();
  const selection = selectRecordBlock(base, base.blocks[0]!.id, Date.parse(z("01:02")));
  if (selection?.kind !== "range") throw new Error("range selection expected");
  expect(() =>
    resizeRecordBlock(base, selection, { endMs: Date.parse(z("01:10")) }, Date.parse(z("01:05"))),
  ).toThrow(expect.objectContaining({ code: "future" }));
});
