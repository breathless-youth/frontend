import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import {
  changeRecordDraft,
  createRecordDraft,
  recordDraftDurationSec,
  recordDraftOperations,
} from "../recordDraft";

afterEach(cleanup);
const start = "2026-11-06T00:00:00Z";

it.each([
  [7, "7초", 1],
  [59, "59초", 1],
  [83, "1분 23초", 2],
  [3683, "1시간 1분 23초", 62],
] as const)("%s초 기록은 칠한 분과 별도로 실제 길이를 보여 준다", (seconds, label, minutes) => {
  const day = plannerDay({
    records: [
      plannerRecord({
        startedAt: start,
        endedAt: new Date(Date.parse(start) + seconds * 1000).toISOString(),
        subjectSegments: [],
      }),
    ],
  });
  const draft = createRecordDraft(day);
  expect(recordDraftDurationSec(draft.blocks[0]!)).toBe(seconds);
  expect(recordDraftOperations(draft)).toEqual([]);
  render(
    <MemoryRouter>
      <PlannerRecordEditor day={day} subjects={[]} onClose={() => {}} onSaved={async () => {}} />
    </MemoryRouter>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  const blocks = [...grid.querySelectorAll<HTMLButtonElement>("[data-record]")];
  expect(
    blocks.reduce((sum, b) => sum + (Number.parseFloat(b.style.width) * 60) / 100, 0),
  ).toBeCloseTo(minutes);
  fireEvent.click(blocks[0]!);
  expect(
    within(screen.getByRole("region", { name: "선택한 기록" })).getByText(label),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  expect(screen.getByRole("dialog")).toHaveTextContent(label);
});

it("한쪽 경계만 고치면 다른 쪽의 원본 초를 길이에 보존한다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: [
        plannerRecord({
          startedAt: "2026-11-06T00:00:37.500Z",
          endedAt: "2026-11-06T00:02:00.500Z",
          subjectSegments: [],
        }),
      ],
    }),
  );
  const block = draft.blocks[0]!;
  expect(recordDraftDurationSec(block)).toBe(83);
  const changed = changeRecordDraft(
    draft,
    block.id,
    { endMs: Date.parse("2026-11-06T00:04:00Z") },
    Date.parse("2026-11-06T12:00:00Z"),
  );
  expect(recordDraftDurationSec(changed.blocks[0]!)).toBe(203);
  expect(recordDraftOperations(changed)[0]?.startedAt).toBe("2026-11-06T00:00:37.500Z");
});

it("소수 초는 원본 나노초를 보존해 초 단위로 한 번만 올림한다", () => {
  const draft = createRecordDraft(
    plannerDay({
      records: [
        plannerRecord({
          startedAt: "2026-11-06T00:00:00.000000001Z",
          endedAt: "2026-11-06T00:00:04.000000002Z",
          subjectSegments: [],
        }),
      ],
    }),
  );
  expect(recordDraftDurationSec(draft.blocks[0]!)).toBe(5);
  expect(recordDraftOperations(draft)).toEqual([]);
});
