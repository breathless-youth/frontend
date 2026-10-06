import type { NoticeResponse } from "@focusmakers/types";

import { canShowInterviewModal } from "@/features/interview/interviewGate";
import type { InterviewState } from "@/features/interview/interviewStore";

export type NoticeChoice =
  | { kind: "general"; notice: NoticeResponse }
  | { kind: "interview"; notice: NoticeResponse; source: "g1_revisit" | "g2_return" };

/**
 * 홈에서 띄울 공지 하나 고르기
 *
 * 일반 공지를 먼저 보고, 없을 때만 인터뷰 공지를 고른다.
 * 서버 정렬이 최신 시작순이라 같은 종류 안에서는 앞의 것을 고른다.
 */
export function selectNotice(input: {
  notices: readonly NoticeResponse[];
  isDismissed: (id: number) => boolean;
  interviewState: InterviewState | null;
  revisit: boolean;
  nowMs: number;
}): NoticeChoice | null {
  const general = input.notices.find((n) => n.audience === "ALL" && !input.isDismissed(n.id));
  if (general !== undefined) {
    return { kind: "general", notice: general };
  }
  if (input.interviewState === null || !canShowInterviewModal(input.interviewState, input.nowMs)) {
    return null;
  }
  for (const n of input.notices) {
    if (n.audience === "G2_LAPSED") {
      return { kind: "interview", notice: n, source: "g2_return" };
    }
    if (n.audience === "G1_NOT_STARTED" && input.revisit) {
      return { kind: "interview", notice: n, source: "g1_revisit" };
    }
  }
  return null;
}
