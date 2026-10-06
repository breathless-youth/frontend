import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { openInterviewForm } from "@/features/interview/interviewForm";
import {
  afterApplied,
  afterModalNeverAgain,
  afterModalShown,
  isRevisit,
} from "@/features/interview/interviewGate";
import {
  loadInterviewState,
  loadLastHiddenAt,
  updateInterviewState,
} from "@/features/interview/interviewStore";
import {
  trackInterviewClicked,
  trackInterviewDismissed,
  trackInterviewShown,
} from "@/lib/amplitude";
import { activeNoticesQuery } from "@/lib/noticeQueries";

import { NoticeModal } from "./NoticeModal";
import { type NoticeChoice, selectNotice } from "./noticeSelection";
import {
  hasShownNoticeThisLaunch,
  isNoticeDismissed,
  markNoticeDismissed,
  markNoticeShownThisLaunch,
} from "./noticeStore";

type Open = NoticeChoice & { exposure: number };

/** 공지 판단을 기다려 주는 최대 시간. 넘기면 복구 창을 먼저 띄운다. */
const SETTLE_DEADLINE_MS = 3000;

/**
 * 홈 공지 모달 호스트
 *
 * 홈이 보이게 될 때마다 공지를 새로 받고, 한 실행에 하나만 띄운다.
 * 판정과 상태 변경은 조회 완료 콜백 안에서 한다.
 * 세션 복구 창은 공지 뒤에 떠야 해서, 이번 실행의 공지 판단이 끝나면 onSettled로 알린다.
 */
export function NoticeModalHost({
  userId,
  paused,
  onSettled,
}: {
  userId: number;
  /** 복구 창이 떠 있는 동안 켠다. 홈이 다시 보여도 그 위에 공지를 겹쳐 띄우지 않는다 */
  paused: boolean;
  onSettled: () => void;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [open, setOpen] = useState<Open | null>(null);
  // 조회 콜백이 최신 값을 읽어야 해서 ref에 담는다. 렌더 중에는 쓰지 않는다.
  const pausedRef = useRef(paused);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    pausedRef.current = paused;
    onSettledRef.current = onSettled;
  });
  // 이번 실행 기록이 sessionStorage에 써지지 않은 기기에서도 같은 문서에서 두 번 띄우지 않는다.
  const shownInDocRef = useRef(false);
  // 복구 창은 한 번만 기다리면 되므로 문서당 한 번만 알린다.
  const settledRef = useRef(false);
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettledRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 마감으로 정리한 뒤 첫 조회 응답을 띄우면 뒤이어 온 복구 창과 겹친다. 다음 평가부터 다시 정한다.
    let firstEvaluationExpired = false;
    const evaluate = (isFirst: boolean) => {
      // 이 문서에서 띄운 공지는 닫을 때 정리를 알린다. 떠 있는 동안 알리면 복구 창이 그 위에 뜬다.
      if (shownInDocRef.current) return;
      // 이번 실행에 이미 띄웠으면 결과를 쓸 일이 없어 조회하지 않는다.
      if (hasShownNoticeThisLaunch()) {
        settle();
        return;
      }
      if (pausedRef.current) return;
      queryClient
        .fetchQuery(activeNoticesQuery(userId))
        .then((notices) => {
          if (cancelled || pausedRef.current || (isFirst && firstEvaluationExpired)) return;
          // 가려진 사이 도착한 응답으로 노출을 남기면 사용자가 보지 못한 공지가 횟수를 쓴다. 다시 보일 때 정한다.
          if (document.visibilityState !== "visible") return;
          if (shownInDocRef.current) return;
          if (hasShownNoticeThisLaunch()) {
            settle();
            return;
          }
          const nowMs = Date.now();
          const choice = selectNotice({
            notices,
            isDismissed: isNoticeDismissed,
            interviewState: loadInterviewState(),
            revisit: isRevisit(loadLastHiddenAt(), nowMs),
            nowMs,
          });
          if (choice === null) {
            settle();
            return;
          }
          shownInDocRef.current = true;
          markNoticeShownThisLaunch();
          if (choice.kind === "interview") {
            const exposure =
              updateInterviewState((s) => afterModalShown(s, nowMs))?.modalCount ?? 1;
            trackInterviewShown({ source: choice.source, exposure });
            setOpen({ ...choice, exposure });
          } else {
            setOpen({ ...choice, exposure: 0 });
          }
        })
        .catch((error: unknown) => {
          console.warn("[notice] 공지를 불러오지 못해 띄우지 않는다", error);
          if (!cancelled) settle();
        });
    };
    evaluate(true);
    // 조회가 끝나지 않으면 복구 창이 영영 못 뜬다.
    const deadline = setTimeout(() => {
      if (shownInDocRef.current) return;
      firstEvaluationExpired = true;
      settle();
    }, SETTLE_DEADLINE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, userId, settle]);

  if (open === null) {
    return null;
  }

  const close = () => {
    setOpen(null);
    settle();
  };

  if (open.kind === "general") {
    // 일반 공지는 안내만 한다. 링크 버튼을 열 경로가 정해지지 않았다.
    return (
      <NoticeModal
        notice={open.notice}
        onNeverAgain={() => {
          markNoticeDismissed(open.notice.id);
          close();
        }}
        onClose={close}
      />
    );
  }

  const { source, exposure } = open;
  const formUrl = open.notice.buttonUrl;
  return (
    <NoticeModal
      notice={open.notice}
      onPrimary={
        formUrl === null
          ? undefined
          : () => {
              updateInterviewState(afterApplied);
              trackInterviewClicked({ source, exposure });
              close();
              openInterviewForm(formUrl, location.search);
            }
      }
      onNeverAgain={() => {
        updateInterviewState(afterModalNeverAgain);
        trackInterviewDismissed({ source, exposure, action: "never_again" });
        close();
      }}
      onClose={() => {
        trackInterviewDismissed({ source, exposure, action: "close" });
        close();
      }}
    />
  );
}
