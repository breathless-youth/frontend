import { describe, expect, it } from "vitest";

import { makeProfileSchema } from "../profileSchema";
import { NICKNAME_RULE_MESSAGE } from "../profileValidation";

// 지금 규칙에 맞지 않는 옛 값을 가진 사용자다.
// 이 값을 그대로 둔 저장이 막히면 안 된다.
const original = { nickname: "옛_닉네임", goal: null, category: "LEGACY" };
const schema = makeProfileSchema(original);
const unchanged = { nickname: "옛_닉네임", goal: "", category: "LEGACY" };

describe("makeProfileSchema", () => {
  it("닉네임과 카테고리를 바꾸지 않으면 규칙에 맞지 않는 옛 값도 통과한다", () => {
    expect(schema.safeParse(unchanged).success).toBe(true);
  });

  it("앞뒤 공백만 다른 닉네임은 바뀐 것으로 보지 않는다", () => {
    expect(schema.safeParse({ ...unchanged, nickname: "  옛_닉네임  " }).success).toBe(true);
  });

  it("닉네임을 바꾸면 형식 규칙을 검사한다", () => {
    const result = schema.safeParse({ ...unchanged, nickname: "포" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["nickname"],
      message: NICKNAME_RULE_MESSAGE,
    });
  });

  it("목표는 20자까지 허용하고 21자는 거부한다", () => {
    expect(schema.safeParse({ ...unchanged, goal: "가".repeat(20) }).success).toBe(true);
    const result = schema.safeParse({ ...unchanged, goal: "가".repeat(21) });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["goal"],
      message: "목표는 20자까지 쓸 수 있어요",
    });
  });

  it("20자를 넘는 옛 목표는 그대로 두면 통과하고 바꾸면 검사한다", () => {
    const legacyGoal = makeProfileSchema({ ...original, goal: "가".repeat(25) });
    const legacyUnchanged = { ...unchanged, goal: "가".repeat(25) };
    expect(legacyGoal.safeParse(legacyUnchanged).success).toBe(true);
    const result = legacyGoal.safeParse({ ...legacyUnchanged, goal: "가".repeat(21) });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["goal"],
      message: "목표는 20자까지 쓸 수 있어요",
    });
  });

  it("카테고리를 목록 값이나 미선택으로 바꾸면 통과한다", () => {
    expect(schema.safeParse({ ...unchanged, category: "JOB" }).success).toBe(true);
    expect(schema.safeParse({ ...unchanged, category: null }).success).toBe(true);
  });

  it("카테고리를 목록 밖 값으로 바꾸면 거부한다", () => {
    const result = schema.safeParse({ ...unchanged, category: "UNKNOWN" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["category"] });
  });
});
