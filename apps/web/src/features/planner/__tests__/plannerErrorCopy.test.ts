import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";

import { plannerErrorCopy } from "../plannerErrorCopy";

describe("plannerErrorCopy", () => {
  it.each([
    ["PLANNER_DUPLICATE_OCCURRENCE", 409, "그 날짜에 같은 반복 할 일이 이미 있어요"],
    ["PLANNER_TASK_LIMIT", 409, "과목 하나에 할 일은 30개까지 넣을 수 있어요"],
    ["PLANNER_CARRYOVER_CHANGED", 409, "그사이 할 일이 바뀌어 목록을 새로 불러왔어요"],
    ["PLANNER_PAST_DAY", 400, "지난 날의 계획은 바꿀 수 없어요"],
  ])("%s 코드는 그 이유를 보여 준다", (code, status, copy) => {
    expect(plannerErrorCopy(new ApiError("서버 메시지", status, code))).toBe(copy);
  });

  it("할 일을 대상으로 한 요청의 404만 이미 지워진 할 일 문구다", () => {
    const missing = new ApiError("할 일을 찾을 수 없습니다", 404, "NOT_FOUND");
    expect(plannerErrorCopy(missing, { taskTarget: true })).toBe("이미 지워진 할 일이에요");
    expect(plannerErrorCopy(new ApiError("과목을 찾을 수 없습니다", 404, "NOT_FOUND"))).toBe(
      "잠시 후 다시 시도해 주세요",
    );
  });

  it("모르는 코드와 ApiError가 아닌 오류는 다시 시도 문구다", () => {
    expect(plannerErrorCopy(new ApiError("충돌", 409, "CONFLICT"))).toBe(
      "잠시 후 다시 시도해 주세요",
    );
    expect(plannerErrorCopy(new TypeError("Failed to fetch"))).toBe("잠시 후 다시 시도해 주세요");
  });

  it("fallback을 주면 모를 때 그 문구를 쓴다", () => {
    expect(
      plannerErrorCopy(new ApiError("충돌", 409, "CONFLICT"), { fallback: "옮기지 못했어요" }),
    ).toBe("옮기지 못했어요");
    expect(
      plannerErrorCopy(new ApiError("중복", 409, "PLANNER_DUPLICATE_OCCURRENCE"), {
        fallback: "옮기지 못했어요",
      }),
    ).toBe("그 날짜에 같은 반복 할 일이 이미 있어요");
  });
});
