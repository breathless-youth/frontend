import type { NoticeResponse } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import { afterApplied } from "@/features/interview/interviewGate";
import { INITIAL_INTERVIEW_STATE as S0 } from "@/features/interview/interviewStore";

import { selectNotice } from "../noticeSelection";

const NOW = new Date(2026, 9, 6, 9, 0).getTime();

function notice(id: number, audience: NoticeResponse["audience"]): NoticeResponse {
  return {
    id,
    title: `t${id}`,
    content: "c",
    imageUrl: null,
    audience,
    badgeText: null,
    buttonText: null,
    buttonUrl: null,
  };
}

const base = { isDismissed: () => false, interviewState: S0, revisit: true, nowMs: NOW };

describe("selectNotice", () => {
  it("일반 공지가 있으면 인터뷰보다 먼저 고른다", () => {
    const choice = selectNotice({ ...base, notices: [notice(2, "G2_LAPSED"), notice(1, "ALL")] });
    expect(choice).toEqual({ kind: "general", notice: notice(1, "ALL") });
  });
  it("다시 보지 않기한 일반 공지는 건너뛴다", () => {
    const choice = selectNotice({
      ...base,
      notices: [notice(1, "ALL"), notice(2, "G2_LAPSED")],
      isDismissed: (id) => id === 1,
    });
    expect(choice).toEqual({
      kind: "interview",
      notice: notice(2, "G2_LAPSED"),
      source: "g2_return",
    });
  });
  it("G1은 재방문일 때만 고른다", () => {
    const notices = [notice(5, "G1_NOT_STARTED")];
    expect(selectNotice({ ...base, notices, revisit: false })).toBeNull();
    expect(selectNotice({ ...base, notices })).toEqual({
      kind: "interview",
      notice: notice(5, "G1_NOT_STARTED"),
      source: "g1_revisit",
    });
  });
  it("G2는 재방문이 아니어도 고른다", () => {
    expect(selectNotice({ ...base, notices: [notice(6, "G2_LAPSED")], revisit: false })?.kind).toBe(
      "interview",
    );
  });
  it("인터뷰 판정이 막으면 인터뷰 공지를 고르지 않는다", () => {
    expect(
      selectNotice({
        ...base,
        notices: [notice(6, "G2_LAPSED")],
        interviewState: afterApplied(S0),
      }),
    ).toBeNull();
  });
  it("노출 기록을 읽지 못하면 인터뷰 공지를 고르지 않는다", () => {
    expect(
      selectNotice({ ...base, notices: [notice(6, "G2_LAPSED")], interviewState: null }),
    ).toBeNull();
  });
  it("공지가 없으면 null이다", () => {
    expect(selectNotice({ ...base, notices: [] })).toBeNull();
  });
});
