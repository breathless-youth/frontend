import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  trackInterviewClicked,
  trackInterviewDismissed,
  trackInterviewShown,
} from "@/lib/amplitude";
import { interviewStatusQuery } from "@/lib/interviewQueries";

import { InterviewCard } from "./InterviewCard";
import { openInterviewForm } from "./interviewForm";
import { afterApplied, afterCardShown, canShowInterviewCard } from "./interviewGate";
import { loadInterviewState, updateInterviewState } from "./interviewStore";

/**
 * 결과 화면 인터뷰 카드 호스트
 *
 * 결과가 드러난 뒤 마운트되어, 방금 제출한 세션까지 반영된 대상 여부를 새로 받는다.
 * 판정과 노출 기록은 응답 콜백 안에서만 한다. 화면을 떠난 뒤 도착한 응답이 보이지도 않은
 * 카드를 노출로 남기지 않게 하려는 것이다.
 */
export function InterviewCardHost({ userId }: { userId: number }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [card, setCard] = useState<{ url: string; exposure: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    queryClient
      .fetchQuery(interviewStatusQuery(userId))
      .then((status) => {
        if (cancelled || !status.cardEligible || status.cardUrl === null) return;
        const nowMs = Date.now();
        const state = loadInterviewState();
        if (state === null || !canShowInterviewCard(state, nowMs)) return;
        const exposure = updateInterviewState((s) => afterCardShown(s, nowMs))?.cardShownCount ?? 1;
        trackInterviewShown({ source: "g3_complete", exposure });
        setCard({ url: status.cardUrl, exposure });
      })
      .catch((error: unknown) => {
        console.warn("[interview] 카드 대상 여부를 불러오지 못해 띄우지 않는다", error);
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient, userId]);

  if (card === null) return null;

  return (
    <InterviewCard
      onApply={() => {
        updateInterviewState(afterApplied);
        trackInterviewClicked({ source: "g3_complete", exposure: card.exposure });
        openInterviewForm(card.url, location.search);
      }}
      onDismiss={() => {
        trackInterviewDismissed({ source: "g3_complete", exposure: card.exposure, action: "x" });
        setCard(null);
      }}
    />
  );
}
