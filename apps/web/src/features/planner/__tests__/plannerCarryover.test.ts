import { describe, expect, it } from "vitest";
import { plannerTask } from "@/test/plannerFixtures";
import { carryoverCandidates, carryoverRequest, groupCarryoverTasks } from "../plannerCarryover";

describe("carryoverCandidates", () => {
  it("키 형식을 해석하지 않고 서버가 준 불투명 키를 보존한다", () => {
    const task = plannerTask({ key: "opaque/new-format/42", date: "2026-11-04" });
    expect(carryoverCandidates([task], "2026-11-05")).toEqual([task]);
    expect(() => carryoverCandidates([plannerTask({ key: "" })], "2026-11-05")).toThrow();
  });
  it("서버 후보 중 지난 미완료만 날짜별로 묶고 반복은 최근 회차만 남긴다", () => {
    const tasks = carryoverCandidates(
      [
        plannerTask({ key: "t:1", date: "2026-11-03" }),
        plannerTask({ key: "t:2", date: "2026-11-04", done: true }),
        plannerTask({ key: "t:3", date: "2026-11-05" }),
        plannerTask({ key: "t:4", date: "2026-11-04", dismissed: true }),
        plannerTask({ key: "r:8:2026-11-02", date: "2026-11-02", seriesId: 8 }),
        plannerTask({ key: "r:8:2026-11-04", date: "2026-11-04", seriesId: 8 }),
      ],
      "2026-11-05",
    );
    expect(
      groupCarryoverTasks(tasks).map(({ date, tasks }) => [date, tasks.map((task) => task.key)]),
    ).toEqual([
      ["2026-11-04", ["r:8:2026-11-04"]],
      ["2026-11-03", ["t:1"]],
    ]);
  });

  it.each([
    null,
    {},
    [null],
    [{ key: "t:1" }],
    [plannerTask({ date: "2026-02-30" })],
    [plannerTask(), plannerTask()],
    Array.from({ length: 1001 }, (_, i) => plannerTask({ key: `t:${i + 1}` })),
  ])("알 수 없는 응답은 일부 항목을 영구 무시하지 않도록 거절한다: %j", (raw) => {
    expect(() => carryoverCandidates(raw, "2026-11-05")).toThrow();
  });
});

it("선택 해제한 키도 offeredKeys에 보내 서버가 같은 항목을 다시 묻지 않게 한다", () => {
  const tasks = [plannerTask({ key: "t:1" }), plannerTask({ key: "t:2" })];
  expect(carryoverRequest(tasks, ["t:2", "t:2", "t:9"])).toEqual({
    offeredKeys: ["t:1", "t:2"],
    selectedKeys: ["t:2"],
  });
  expect(carryoverRequest(tasks, [])).toEqual({ offeredKeys: ["t:1", "t:2"], selectedKeys: [] });
});
