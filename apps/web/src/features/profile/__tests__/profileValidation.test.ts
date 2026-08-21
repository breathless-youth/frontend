import { describe, expect, it } from "vitest";

import { validateGoal, validateNickname } from "../profileValidation";

describe("validateNickname", () => {
  it("2~12자 한글·영문·숫자는 유효하다", () => {
    expect(validateNickname("포메3721")).toBeNull();
    expect(validateNickname("ab")).toBeNull();
    expect(validateNickname("가나다라마바사아자차카타")).toBeNull(); // 12자
  });

  it("1자는 짧다", () => {
    expect(validateNickname("가")).not.toBeNull();
  });

  it("13자는 길다", () => {
    expect(validateNickname("가나다라마바사아자차카타파")).not.toBeNull();
  });

  it("특수문자·공백이 섞이면 무효다", () => {
    expect(validateNickname("포메!")).not.toBeNull();
    expect(validateNickname("포 메")).not.toBeNull();
  });

  it("빈 문자열은 무효다", () => {
    expect(validateNickname("")).not.toBeNull();
  });
});

describe("validateGoal", () => {
  it("공백 포함 20자까지 유효하다", () => {
    expect(validateGoal("올해 안에 이직 성공")).toBeNull();
    expect(validateGoal("12345678901234567890")).toBeNull(); // 20자
  });

  it("21자는 길다", () => {
    expect(validateGoal("123456789012345678901")).not.toBeNull();
  });

  it("빈 문자열은 유효하다 — 목표는 선택 항목", () => {
    expect(validateGoal("")).toBeNull();
  });
});
