import { expect, it } from "vitest";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
import {
  addRecordDraft,
  changeRecordDraft,
  createRecordDraft,
  firstRecordDraftMinute,
} from "../recordDraft";

const iso = (time: string) => `2026-11-07T${time}+09:00`;
const now = Date.parse(iso("23:00:00"));
function day() {
  return createRecordDraft(
    plannerDay({
      date: "2026-11-07",
      records: [
        plannerRecord({
          key: "visible",
          startedAt: iso("16:16:44.736"),
          endedAt: iso("16:18:27.703"),
          subjectSegments: [],
        }),
        plannerRecord({
          key: "short",
          startedAt: iso("16:19:35.566"),
          endedAt: iso("16:19:39.766"),
          subjectSegments: [],
        }),
      ],
    }),
  );
}

it("16:20 경계로 올림되는 짧은 원본과의 충돌을 저장 전에 막는다", () => {
  expect(() =>
    changeRecordDraft(
      day(),
      "visible",
      { startMs: Date.parse(iso("08:00:00")), endMs: Date.parse(iso("16:20:00")) },
      now,
    ),
  ).toThrow("overlap");
  expect(() =>
    changeRecordDraft(
      day(),
      "visible",
      { startMs: Date.parse(iso("08:00:00")), endMs: Date.parse(iso("16:19:00")) },
      now,
    ),
  ).not.toThrow();
});

it("새 직접 입력도 반올림된 점이 아니라 짧은 원본의 실제 점유 시간을 검사한다", () => {
  const draft = day();
  draft.blocks = draft.blocks.filter((block) => block.id === "short");
  expect(() =>
    addRecordDraft(
      draft,
      {
        id: "new",
        startMs: Date.parse(iso("16:00:00")),
        endMs: Date.parse(iso("16:20:00")),
        subjectId: null,
      },
      now,
    ),
  ).toThrow("overlap");
});

it("짧은 기록을 먼저 옮긴 초안은 새 점유 구간으로 비교한다", () => {
  const moved = changeRecordDraft(
    day(),
    "short",
    { startMs: Date.parse(iso("16:21:00")), endMs: Date.parse(iso("16:22:00")) },
    now,
  );
  expect(() =>
    changeRecordDraft(moved, "visible", { endMs: Date.parse(iso("16:20:00")) }, now),
  ).not.toThrow();
});

it("원본 종료의 소수 밀리초가 다음 분 경계를 넘으면 겹침을 놓치지 않는다", () => {
  const draft = createRecordDraft(
    plannerDay({
      date: "2026-11-07",
      records: [
        plannerRecord({
          startedAt: iso("16:19:00"),
          endedAt: iso("16:20:00.000001"),
          subjectSegments: [],
        }),
      ],
    }),
  );
  expect(() =>
    addRecordDraft(
      draft,
      {
        id: "new",
        startMs: Date.parse(iso("16:20:00")),
        endMs: Date.parse(iso("16:21:00")),
        subjectId: null,
      },
      now,
    ),
  ).toThrow("overlap");
});

it("기록 추가는 첫 분에 있는 짧은 원본을 건너뛰고 실제로 비어 있는 1분을 찾는다", () => {
  const draft = createRecordDraft(
    plannerDay({
      date: "2026-11-07",
      records: [
        plannerRecord({
          startedAt: iso("05:00:10"),
          endedAt: iso("05:00:20"),
          subjectSegments: [],
        }),
      ],
    }),
  );
  expect(firstRecordDraftMinute(draft, now)).toEqual({
    startMs: Date.parse(iso("05:01:00")),
    endMs: Date.parse(iso("05:02:00")),
  });
});
