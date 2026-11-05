import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Graphemes from "@/lib/graphemes";

import { groupFieldError, isOverGroupLimit } from "../fieldError";

const graphemes = vi.hoisted(() => ({ canSegment: true }));

// 글자 단위로 셀 수 없는 구형 웹뷰를 흉내 내려고 판정 표시만 바꾸고 나머지는 실제 모듈을 쓴다.
vi.mock("@/lib/graphemes", async (importOriginal) => ({
  ...(await importOriginal<typeof Graphemes>()),
  get canSegmentGraphemes() {
    return graphemes.canSegment;
  },
}));

afterEach(() => {
  graphemes.canSegment = true;
});

describe("groupFieldError", () => {
  it("한도 안의 평범한 글에는 오류가 없다", () => {
    expect(groupFieldError("9급 행정직 준비 중이에요", 50, true)).toBeNull();
  });

  it("한도를 넘으면 한도를 알린다", () => {
    expect(groupFieldError("가".repeat(51), 50, false)).toBe("50자까지 쓸 수 있어요");
  });

  it("끝에 붙은 공백은 글자 수에 넣지 않는다", () => {
    expect(groupFieldError(`${"가".repeat(50)}  `, 50, false)).toBeNull();
  });

  it("연락처를 보는 칸이면 연락처나 링크를 알린다", () => {
    expect(groupFieldError("카톡 abc123", 50, true)).toBe("연락처나 링크는 보낼 수 없어요");
  });

  it("연락처를 보지 않는 칸이면 연락처가 있어도 오류가 없다", () => {
    expect(groupFieldError("카톡 abc123", 100, false)).toBeNull();
  });

  it("한도를 넘은 글에 연락처도 있으면 한도만 알린다", () => {
    expect(groupFieldError(`카톡 abc123 ${"가".repeat(45)}`, 50, true)).toBe(
      "50자까지 쓸 수 있어요",
    );
  });

  it("서버가 막은 문장은 연락처 안내보다 먼저 보이고 글자 수 안내보다는 뒤다", () => {
    expect(groupFieldError("카톡 abc123", 50, true, "서버가 막은 문장")).toBe("서버가 막은 문장");
    expect(groupFieldError("평범한 글", 100, false, "서버가 막은 문장")).toBe("서버가 막은 문장");
    expect(groupFieldError("가".repeat(51), 50, true, "서버가 막은 문장")).toBe(
      "50자까지 쓸 수 있어요",
    );
  });

  it("글자 단위로 셀 수 없는 환경에서는 글자 수로 막지 않고 연락처만 알린다", () => {
    graphemes.canSegment = false;
    expect(groupFieldError("가".repeat(51), 50, false)).toBeNull();
    expect(groupFieldError(`카톡 abc123 ${"가".repeat(45)}`, 50, true)).toBe(
      "연락처나 링크는 보낼 수 없어요",
    );
  });
});

describe("isOverGroupLimit", () => {
  it("공백을 뺀 글자 수가 한도를 넘을 때만 참이다", () => {
    expect(isOverGroupLimit("가".repeat(50), 50)).toBe(false);
    expect(isOverGroupLimit(`${"가".repeat(50)}  `, 50)).toBe(false);
    expect(isOverGroupLimit("가".repeat(51), 50)).toBe(true);
  });

  it("글자 단위로 셀 수 없는 환경에서는 거짓이다", () => {
    graphemes.canSegment = false;
    expect(isOverGroupLimit("가".repeat(51), 50)).toBe(false);
  });
});
