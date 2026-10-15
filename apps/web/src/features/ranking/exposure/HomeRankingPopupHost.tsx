import type { RankingOvertaken } from "@focusmakers/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { loadLastHiddenAt } from "@/features/interview/interviewStore";
import { hasShownNoticeThisLaunch, markNoticeShownThisLaunch } from "@/features/notice/noticeStore";
import { useFocusStart } from "@/features/onboarding/useFocusStart";
import { hasShownRecoveryThisLaunch } from "@/features/study-session/recoveryLaunchStore";
import {
  trackRankingMedalModalAction,
  trackRankingMedalModalShown,
  trackRankingOvertakeAction,
  trackRankingOvertakeShown,
} from "@/lib/amplitude";
import { postRankingRecordsSeen } from "@/lib/rankingApi";
import { hasRankingTab } from "@/lib/rankingCapability";
import { rankingHomeQuery, rankingUnseenQuery } from "@/lib/rankingQueries";

import { DEFAULT_RANKING_BOARD } from "../model/board";
import {
  afterUnseen,
  loadRankingPopupDays,
  markMedalShown,
  markOvertakeChecked,
  overtakeToShow,
  rankingPopupAllowed,
} from "./homePopup";
import { MedalModal } from "./MedalModal";
import { medalModalView, type MedalModalView } from "./medalView";
import { useOpenRanking } from "./navigation";
import { OvertakeSheet } from "./OvertakeSheet";

type Popup =
  { kind: "medal"; view: MedalModalView } | { kind: "overtake"; overtaken: RankingOvertaken };

/**
 * 홈 랭킹 팝업 호스트
 *
 * 공지·인터뷰·복구 창 판단이 끝나면(`ready`) 이 문서에서 한 번 판단해 메달 모달이나 추월 시트 하나를 띄운다.
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
  const startFocus = useFocusStart(userId);
  const { openBoard, openRecords } = useOpenRanking();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [open, setOpen] = useState(false);
  // 닫히는 동안 남은 버튼을 연달아 눌러도 이동과 이벤트가 한 번만 나가게 한다.
  const handledRef = useRef(false);
  // 판단은 공지와 복구 판단 뒤라 몇 초 늦을 수 있다.
  // 그 사이 앱을 오가면 숨김 기록이 지금으로 바뀌어 추월을 지금부터 묻고 그날 확인도 써 버리므로 홈이 뜰 때 값을 잡아 둔다.
  const [launchHiddenAt] = useState(loadLastHiddenAt);
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
    // 가려진 사이 받은 응답으로 띄우면 사용자가 보지 못한 메달이 본 것으로 넘어간다.
    // 응답을 기다리는 사이 복구 결과가 오면 그 창이 먼저라 응답마다 다시 본다.
    const canShow = () => !cancelled && document.visibilityState === "visible" && allowed();
    const show = (next: Popup) => {
      markNoticeShownThisLaunch();
      handledRef.current = false;
      setPopup(next);
      setOpen(true);
    };
    const run = async () => {
      const unseen = await queryClient.fetchQuery(rankingUnseenQuery(userId));
      if (!canShow()) {
        return;
      }
      const next = afterUnseen({
        unseenCount: unseen.records.length,
        nowMs: Date.now(),
        lastHiddenAtMs: launchHiddenAt,
        days: loadRankingPopupDays(),
      });
      if (next.kind === "medal") {
        const view = medalModalView(unseen);
        if (view === null) {
          return;
        }
        markMedalShown(next.dayKey);
        trackRankingMedalModalShown({
          count: view.count,
          bestRank: view.bestRank,
          mixedPeriod: view.mixed,
        });
        show({ kind: "medal", view });
        // 띄운 직후 본 것으로 적는다.
        // 실패하면 다음 실행에 같은 메달이 다시 뜬다.
        postRankingRecordsSeen(unseen.records.map((record) => record.id)).catch(
          (error: unknown) => {
            console.warn("[ranking] 메달을 본 것으로 적지 못했다", error);
          },
        );
        return;
      }
      if (next.kind === "rest") {
        return;
      }
      markOvertakeChecked(next.dayKey);
      if (next.since === null) {
        return;
      }
      const home = await queryClient.fetchQuery(rankingHomeQuery(userId, next.since));
      const overtaken = overtakeToShow(home.overtaken);
      if (overtaken === null || !canShow()) {
        return;
      }
      trackRankingOvertakeShown({
        count: overtaken.count,
        fromRank: overtaken.fromRank,
        toRank: overtaken.toRank,
      });
      show({ kind: "overtake", overtaken });
    };
    run().catch((error: unknown) => {
      console.warn("[ranking] 홈 랭킹 팝업을 정하지 못해 이번에는 띄우지 않는다", error);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId, queryClient, launchHiddenAt]);

  if (popup === null) {
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

  if (popup.kind === "medal") {
    return (
      <MedalModal
        view={popup.view}
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

  return (
    <OvertakeSheet
      overtaken={popup.overtaken}
      open={open}
      onStudy={() => {
        if (claim()) {
          trackRankingOvertakeAction("study");
          startFocus("overtake_popup");
        }
      }}
      onRanking={() => {
        if (claim()) {
          trackRankingOvertakeAction("ranking");
          openBoard(DEFAULT_RANKING_BOARD, "overtake_popup");
        }
      }}
      onClose={() => {
        if (claim()) {
          trackRankingOvertakeAction("close");
        }
      }}
    />
  );
}
