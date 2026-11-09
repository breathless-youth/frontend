import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import type { SessionStatusPillState } from "./SessionStatusPill";

/** 큰 숫자. 가로는 기본 44px, 심플 72px이다. */
const NUMBER_SIZE =
  "text-[52px] leading-15 font-bold tracking-[-0.5px] tabular-nums regular:text-8xl regular:leading-none regular:tracking-[-0.03em] short-side-lg:text-[7.5rem]";

export interface SessionClockProps {
  /** 이번 세션 공부 시간(초). 비집중에도 흐르고 일시정지에 멈춘다. */
  studySec: number;
  focusSec: number;
  /** 오늘 저장된 공부 시간 + 이번 세션 공부 시간(초) */
  todayStudySec: number;
  state: SessionStatusPillState;
  /** 집중 중이 아닐 때 `현재 공부` 자리에 대신 보이는 상태 문구 */
  statusLabel: string;
  simple: boolean;
  infoOpen: boolean;
  onToggleInfo: () => void;
  /** 도움말 화면이 상태 문구와 카드에 겹쳐 그리는 테두리·설명 */
  callouts?: { caption?: ReactNode; card?: ReactNode };
  /** 도움말 화면의 가짜 묶음. 라이브 리전과 버튼 없이 모양만 그린다. */
  fake?: boolean;
}

/**
 * 세션 화면 가운데 시간 묶음
 *
 * 큰 숫자는 이번 세션 공부 시간이고 아래 작은 줄은 오늘 누적 공부 시간이다.
 * 순공과 집중률은 ⓘ 버튼으로 펼치는 카드에만 보인다.
 * 시안에는 상태 필이 없어서, 비집중·일시정지는 `현재 공부` 자리를 상태 색 문구로 바꿔 알린다.
 * 상태 문구는 자동 감지로 바뀌므로 라이브 리전으로 읽힌다.
 */
export function SessionClock({
  studySec,
  focusSec,
  todayStudySec,
  state,
  statusLabel,
  simple,
  infoOpen,
  onToggleInfo,
  callouts,
  fake = false,
}: SessionClockProps) {
  const { t } = useTranslation("study-session");
  const rate = studySec > 0 ? (focusSec / studySec) * 100 : 0;
  const infoIcon = (
    <span
      className={cn(
        "flex size-5.5 items-center justify-center rounded-full",
        infoOpen ? "bg-white/22 text-white" : "text-white/60",
      )}
    >
      <Info aria-hidden="true" className="size-4" strokeWidth={1.8} />
    </span>
  );
  return (
    <div className="relative flex flex-col items-center">
      {/* 타이머 배경 사진 위에서도 읽히게 시안대로 글자 그림자를 깐다. */}
      <div className="relative flex items-center gap-1 [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]">
        {callouts?.caption}
        <p
          role={fake ? undefined : "status"}
          aria-live={fake ? undefined : "polite"}
          aria-hidden={fake || undefined}
          className={cn(
            "text-xs leading-4 regular:text-sm regular:leading-5",
            state === "focus" ? "text-white/60" : "font-semibold text-(--session-state-color)",
          )}
        >
          {state === "focus" ? t("clock.current") : statusLabel}
        </p>
        {fake ? (
          <span
            aria-hidden="true"
            className="-my-3.5 -mr-3.5 -ml-2.5 flex size-11 items-center justify-center"
          >
            {infoIcon}
          </span>
        ) : (
          <button
            type="button"
            aria-label={t("clock.info")}
            aria-expanded={infoOpen}
            onClick={onToggleInfo}
            className="pointer-events-auto -my-3.5 -mr-3.5 -ml-2.5 flex size-11 items-center justify-center"
          >
            {infoIcon}
          </button>
        )}
      </div>
      <div
        aria-hidden={fake || undefined}
        className="flex flex-col items-center [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]"
      >
        <p
          className={cn(
            "mt-1 text-center landscape-compact:mt-0.5",
            NUMBER_SIZE,
            simple
              ? "landscape-compact:text-[72px] landscape-compact:leading-20"
              : "landscape-compact:text-[44px] landscape-compact:leading-13",
            state === "paused" ? "text-text-tertiary" : "text-white",
          )}
        >
          <span aria-hidden="true">{formatElapsed(studySec)}</span>
          <span className="sr-only">
            {t("clock.srStudy", { duration: toKoreanDuration(studySec) })}
          </span>
        </p>
        <p
          className={cn(
            "mt-1.75 text-center text-[15px] leading-4.5 font-medium whitespace-nowrap text-white/42 tabular-nums regular:text-[1.375rem] regular:leading-7",
            !simple && "landscape-compact:mt-1.25",
          )}
        >
          <span aria-hidden="true">
            {t("clock.today", { elapsed: formatElapsed(todayStudySec) })}
          </span>
          <span className="sr-only">
            {t("clock.srToday", { duration: toKoreanDuration(todayStudySec) })}
          </span>
        </p>
      </div>
      {infoOpen && (
        <div
          role={fake ? undefined : "region"}
          aria-label={fake ? undefined : t("clock.info")}
          // 세로는 카드를 묶음 아래에 띄워서 펼쳐도 시간 자리가 움직이지 않는다(시안 19c는 카드를 펼쳐도 y=300).
          // 가로는 화면이 낮아 띄우면 하단 바와 겹치므로 묶음 안에 넣어 함께 가운데로 맞춘다.
          className="absolute top-full left-1/2 mt-4.5 flex w-69 -translate-x-1/2 items-center gap-4 rounded-xl bg-(--session-pill-bg) px-4.5 py-3.5 backdrop-blur-[10px] landscape-compact:relative landscape-compact:top-auto landscape-compact:left-auto landscape-compact:translate-x-0"
        >
          {callouts?.card}
          <dl className="flex flex-1 flex-col items-center gap-0.5">
            <dt className="text-xs leading-4 whitespace-nowrap text-white/60">
              {t("clock.focus")}
            </dt>
            <dd className="text-xl leading-6.5 font-bold text-white tabular-nums">
              {formatElapsed(focusSec)}
            </dd>
          </dl>
          <span aria-hidden="true" className="w-px self-stretch bg-white/14" />
          <dl className="flex flex-1 flex-col items-center gap-0.5">
            <dt className="text-xs leading-4 whitespace-nowrap text-white/60">{t("clock.rate")}</dt>
            {/* 집중하지 않는 동안은 상태 문구와 같은 상태 색(비집중 주황·일시정지 회색)으로 바꾼다. */}
            <dd
              data-testid="session-focus-rate"
              className={cn(
                "text-xl leading-6.5 font-bold tabular-nums",
                state === "focus"
                  ? "text-(--session-control-resume-bg)"
                  : "text-(--session-state-color)",
              )}
            >
              {rate.toFixed(1)}%
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}
