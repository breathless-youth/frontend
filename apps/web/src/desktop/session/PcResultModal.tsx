import type { StudySessionResponse } from "@focusmakers/types";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isTimerSession } from "@/features/manual-record/manualRecord";
import { SessionSummaryCard } from "@/features/study-session/components/SessionSummaryCard";
import { StudyTimelineCard } from "@/features/study-session/components/StudyTimelineCard";
import { toKoreanDurationLength } from "@/features/study-session/formatDuration";
import { toSessionResultView } from "@/features/study-session/sessionResult";
import { ResultTimelapseCard } from "@/features/timelapse/ResultTimelapseCard";
import {
  consumeStudyResultExit,
  stageStudyResultExit,
  trackStudyResultConfirmed,
} from "@/lib/amplitude";
import { useUserId } from "@/lib/userId";

// 휴대폰 결과 카드의 흰 카드·그림자 대신 창 안의 옅은 바탕 카드로 그린다.
// 그림자는 레이어 밖 클래스라 important로 끈다.
const CARD_CLASS = "rounded-[10px] border-0 shadow-none!";

export interface PcResultModalProps {
  sessions: StudySessionResponse[];
  startedAtMs: number;
  /** 창이 놓일 홈 상자 */
  container: HTMLElement | null;
  /** 닫기, X, 바깥 누름, Esc로 홈 상태로 돌아간다. */
  onClose: () => void;
  /** 창이 닫힌 뒤 포커스를 둘 곳을 홈이 정한다. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * PC 홈 위 공부 결과 창
 *
 * 주소를 바꾸지 않고 홈 상자 안에 띄워서, 닫으면 월페이퍼와 패널이 그대로 남은 홈으로 돌아온다.
 * 주소가 그대로라 경로 추적기가 이탈 예약을 가져가지 않으므로, 홈으로 닫을 때는 예약을 남기자마자 바로 보낸다.
 * 기록으로 가기는 주소가 바뀌어 기록 화면의 경로 추적기가 지금처럼 보낸다.
 * 휴대폰 결과 화면처럼 첫 세션만 그리고, 자정으로 나뉜 세션의 순공은 이탈 예약에만 더한다.
 * 결과가 길면 제목 줄과 버튼 줄은 남기고 본문만 굴려 닫을 길이 늘 보이게 한다.
 * 본문 안에서는 카드 바탕색 변수를 옅은 바탕으로 바꿔, 카드 안 조각 간격과 말꼬리가 카드와 같은 색으로 이어진다.
 */
export function PcResultModal({
  sessions,
  startedAtMs,
  container,
  onClose,
  onCloseAutoFocus,
}: PcResultModalProps) {
  const { t } = useTranslation(["study-session", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useUserId();
  const first = sessions[0];
  if (first === undefined) return null;
  const view = toSessionResultView(first);
  const timer = isTimerSession(first);
  const totalFocusSec = sessions.reduce((sum, session) => sum + session.focusSec, 0);

  const close = (via: "home" | "records") => {
    trackStudyResultConfirmed({ roomType: "single", via, surface: "pc_home" });
    const consumeAt = via === "home" ? "/home" : "/records";
    stageStudyResultExit({
      roomType: "single",
      focusSec: totalFocusSec,
      consumeAt,
      surface: "pc_home",
    });
    if (via === "home") {
      consumeStudyResultExit(consumeAt);
      onClose();
      return;
    }
    navigate({ pathname: consumeAt, search: location.search });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close("home");
      }}
    >
      <DialogContent
        container={container}
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        aria-describedby={undefined}
        className="flex max-h-[calc(100%-5rem)] w-140 max-w-[calc(100%-2rem)] flex-col gap-5 rounded-xl bg-muted p-6 sm:rounded-xl"
      >
        <div className="flex items-center gap-3">
          <DialogTitle className="flex-1 text-[18px] leading-normal font-bold tracking-normal">
            {t("result.completeTitle")}
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              aria-label={t("common:actions.close")}
              // 보이는 크기는 28px이고 누르는 자리는 44px로 넓힌다.
              className="relative flex size-7 items-center justify-center rounded-md text-foreground before:absolute before:-inset-2 hover:bg-bg-layer-2 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        <div className="-mx-6 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 [--muted:var(--bg-layer-2)]">
          <section className="flex flex-col items-center gap-1.5 pt-3 pb-4 tabular-nums">
            <p className="text-[12px] leading-normal font-bold text-muted-foreground">
              {t(timer ? "result.totalPrefix" : "result.focusLabel")}
            </p>
            <p className="text-[40px] leading-normal font-bold text-foreground">
              {toKoreanDurationLength(timer ? view.studySec : view.focusSec)}
            </p>
            {!timer && (
              <>
                <p className="flex gap-1 text-[14px] leading-normal">
                  <span className="text-muted-foreground">{t("result.totalPrefix")}</span>
                  <span className="font-bold text-foreground">
                    {toKoreanDurationLength(view.studySec)}
                  </span>
                </p>
                <Badge className="bg-bg-layer-2 px-2.5 py-1 leading-normal text-foreground">
                  {t("result.focusRate", { percent: view.focusRatePercent })}
                </Badge>
              </>
            )}
          </section>
          {timer ? (
            <p className="rounded-lg bg-brand-subtle p-3 text-[13px] leading-5 whitespace-pre-line text-brand-subtle-text">
              {t("result.timerNotice")}
            </p>
          ) : (
            <StudyTimelineCard view={view} className={CARD_CLASS} />
          )}
          {userId !== null && (
            <SessionSummaryCard userId={userId} layout="split" className={CARD_CLASS} />
          )}
          {!timer && (
            <ResultTimelapseCard
              startedAtMs={startedAtMs}
              userId={userId}
              shareMode="direct"
              className={CARD_CLASS}
            />
          )}
        </div>

        <div className="flex gap-2">
          <DialogClose asChild>
            <Button
              variant="secondary"
              className="h-12 flex-1 rounded-lg border border-border text-[15px]"
            >
              {t("common:actions.close")}
            </Button>
          </DialogClose>
          <Button
            onClick={() => close("records")}
            className="h-12 flex-1 rounded-lg text-[15px] font-bold"
          >
            {t("result.ctaRecords")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
