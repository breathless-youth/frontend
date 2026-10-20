import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { hasShownNoticeThisLaunch, markNoticeShownThisLaunch } from "@/features/notice/noticeStore";
import { hasShownRecoveryThisLaunch } from "@/features/study-session/recoveryLaunchStore";
import { trackRankingMedalModalAction, trackRankingMedalModalShown } from "@/lib/amplitude";
import { postRankingRecordsSeen } from "@/lib/rankingApi";
import { hasRankingTab } from "@/lib/rankingCapability";
import { rankingUnseenQuery } from "@/lib/rankingQueries";

import { rankingPopupAllowed } from "./homePopup";
import { MedalModal } from "./MedalModal";
import { medalModalView, type MedalModalView } from "./medalView";
import { useOpenRanking } from "./navigation";

/**
 * 홈 랭킹 팝업 호스트
 *
 * 공지·인터뷰·복구 창 판단이 끝나면(`ready`) 이 문서에서 한 번 판단해 안 본 메달이 있으면 메달 모달을 띄운다.
 * 이번 실행에 다른 팝업이 떴으면 쉬고, 띄울 때는 공지와 같은 '이번 실행에 띄움' 표시를 남겨 한 실행에 하나를 지킨다.
 * 요청이 실패하거나 앱이 가려진 사이 응답이 오면 이번에는 쉬고 오류를 보이지 않는다.
 * 열고 닫을 때 `onOpenChange`로 알려, 홈이 늦게 온 복구 창을 이 팝업이 닫힐 때까지 미루게 한다.
 */
export function HomeRankingPopupHost({
  userId,
  ready,
  blocked,
  onOpenChange,
}: {
  userId: number;
  ready: boolean;
  /**
   * 이 문서에서 공지나 복구 창이 이미 나왔는지
   *
   * 이번 실행 표시를 sessionStorage에 쓰지 못한 기기에서도 같은 문서에서는 한 실행에 하나를 지키게 한다.
   */
  blocked: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { openRecords } = useOpenRanking();
  const [view, setView] = useState<MedalModalView | null>(null);
  const [open, setOpen] = useState(false);
  // 닫히는 동안 남은 버튼을 연달아 눌러도 이동과 이벤트가 한 번만 나가게 한다.
  const handledRef = useRef(false);
  // 응답을 기다리는 사이 바뀐 값도 읽어야 해서 ref에 담는다.
  const blockedRef = useRef(blocked);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    blockedRef.current = blocked;
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    onOpenChangeRef.current(true);
    return () => {
      onOpenChangeRef.current(false);
    };
  }, [open]);

  useEffect(() => {
    if (!ready || !hasRankingTab()) {
      return;
    }
    const allowed = () =>
      !blockedRef.current &&
      rankingPopupAllowed({
        noticeShown: hasShownNoticeThisLaunch(),
        recoveryShown: hasShownRecoveryThisLaunch(),
      });
    if (!allowed()) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      const unseen = await queryClient.fetchQuery(rankingUnseenQuery(userId));
      // 가려진 사이 받은 응답으로 띄우면 사용자가 보지 못한 메달이 본 것으로 넘어간다.
      // 응답을 기다리는 사이 복구 결과가 오면 그 창이 먼저라 응답을 받고 다시 본다.
      if (cancelled || document.visibilityState !== "visible" || !allowed()) {
        return;
      }
      const next = medalModalView(unseen);
      if (next === null) {
        return;
      }
      trackRankingMedalModalShown({
        count: next.count,
        bestRank: next.bestRank,
        mixedPeriod: next.mixed,
      });
      markNoticeShownThisLaunch();
      handledRef.current = false;
      setView(next);
      setOpen(true);
      // 띄운 직후 본 것으로 적는다.
      // 실패하면 다음 실행에 같은 메달이 다시 뜬다.
      postRankingRecordsSeen(unseen.records.map((record) => record.id)).catch((error: unknown) => {
        console.warn("[ranking] 메달을 본 것으로 적지 못했다", error);
      });
    };
    run().catch((error: unknown) => {
      console.warn("[ranking] 홈 랭킹 팝업을 정하지 못해 이번에는 띄우지 않는다", error);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId, queryClient]);

  if (view === null) {
    return null;
  }

  /**
   * 버튼 처리 차지
   *
   * 이번 팝업의 버튼 처리를 처음 한 번만 허락하고 팝업을 닫는다.
   */
  const claim = () => {
    if (handledRef.current) {
      return false;
    }
    handledRef.current = true;
    setOpen(false);
    return true;
  };

  return (
    <MedalModal
      view={view}
      open={open}
      onRecords={() => {
        if (claim()) {
          trackRankingMedalModalAction("records");
          openRecords("top3_modal");
        }
      }}
      onClose={() => {
        if (claim()) {
          trackRankingMedalModalAction("close");
        }
      }}
    />
  );
}
