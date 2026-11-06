import { expect, it } from "vitest";
import { plannerDay, plannerRecord, plannerSubject } from "@/test/plannerFixtures";
import { plannerPlanDay } from "../plannerPlanDay";
import { plannerCellFills } from "../plannerDay";

it("개인 집계를 보존하고 10분 칸의 중간부터 1분 단위로 칠한다", () => {
  const day = plannerPlanDay(
    plannerDay({
      date: "2026-11-06",
      focusSec: 901,
      studySec: 960,
      subjects: [plannerSubject({ focusSec: 901 })],
      records: [
        plannerRecord({
          startedAt: "2026-11-06T00:12:20Z",
          endedAt: "2026-11-06T00:28:03Z",
          subjectSegments: [
            {
              subjectId: 3,
              startedAt: "2026-11-06T00:12:20Z",
              endedAt: "2026-11-06T00:28:03Z",
              focusSec: 901,
              studySec: 960,
            },
          ],
        }),
      ],
    }),
  );
  expect(day.focusSec).toBe(901);
  const cells = plannerCellFills(day);
  expect(cells[25]).toMatchObject([
    { left: 0.3, width: 0.7, startsBlock: true, paint: { kind: "subject", subjectId: 3 } },
  ]);
  expect(cells[26]).toMatchObject([{ left: 0, width: 0.9, startsBlock: false }]);
  expect(cells[27]).toEqual([]);
});
