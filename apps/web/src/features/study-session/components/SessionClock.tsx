import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import type { SessionStatusPillState } from "./SessionStatusPill";
import { GLOW_TEXT_SHADOW } from "./SessionTimer";

/** 큰 숫자. 가로는 기본 44px, 심플 72px이다. */
const NUMBER_SIZE =
  "text-[52px] leading-15 font-bold tracking-[-0.5px] tabular-nums regular:text-8xl regular:leading-none regular:tracking-[-0.03em] short-side-lg:text-[7.5rem]";

export type SessionClockView = "focus" | "study";

export interface SessionClockProps {
  /** `focus`는 순공을, `study`는 공부 시간(비집중에도 흐름)을 크게 보인다. */
  view: SessionClockView;
  /** 이번 세션 공부 시간(초). 비집중에도 흐르고 일시정지에 멈춘다. */
  studySec: number;
  /** 이번 세션 순공(초). 집중하는 동안만 흐른다. */
  focusSec: number;
  /** 오늘 저장된 공부 시간 + 이번 세션 공부 시간(초) */
  todayStudySec: number;
  /** 오늘 저장된 순공 + 이번 세션 순공(초) */
  todayFocusSec: number;
  state: SessionStatusPillState;
  /** 집중 중이 아닐 때 라벨 자리에 대신 보이는 상태 문구 */
  statusLabel: string;
  simple: boolean;
  /** 도움말 화면이 상태 문구와 큰 숫자에 겹쳐 그리는 테두리·설명 */
  callouts?: { caption?: ReactNode; number?: ReactNode };
  /** 도움말 화면의 가짜 묶음. 라이브 리전 없이 모양만 그린다. */
  fake?: boolean;
  /** 월페이퍼 위 배치. 왼쪽 정렬이고 글자 그림자를 깐다. */
  corner?: boolean;
}

/** 상태가 바뀔 때 색이 툭 바뀌지 않게 서서히 옮긴다. */
const STATE_COLOR_EASE = "transition-colors duration-500 ease-out motion-reduce:transition-none";

/** 유예 문구 깜빡임. 순공은 흐르므로 경고 색 없이 흰색으로 두고 2초 주기로 옅어졌다 돌아온다. */
const GRACE_LABEL_PULSE =
  "animate-[session-grace-label_2s_ease-in-out_infinite] motion-reduce:animate-none";

/** 상태 문구가 바뀔 때 앞 문구는 사라지고 새 문구는 같은 자리에서 떠오른다. */
const LABEL_SLOT = "[grid-area:1/1] duration-300 motion-reduce:animate-none";

interface ShownLabel {
  key: string;
  text: string;
  /** 문구마다 고정한 색. 상태색 변수는 상태와 함께 바로 바뀌어 사라지는 문구를 물들이므로 쓰지 않는다. */
  tone: string;
}

/** 유예 숫자. 색은 그대로 두고 2초 주기로 살짝 옅어졌다 돌아온다. */
const GRACE_NUMBER_PULSE =
  "animate-[session-grace-number_2s_ease-in-out_infinite] motion-reduce:animate-none";

/** 월페이퍼 위 글자 그림자. 밝은 그림 위에서도 읽히게 가까운 그림자와 넓은 그림자를 겹친다. */
const CORNER_SHADOW = "[text-shadow:0_1px_2px_rgba(0,0,0,0.6),0_4px_16px_rgba(0,0,0,0.45)]";

/**
 * 세션 화면 가운데 시간 묶음
 *
 * 라벨, 큰 숫자, 오늘 줄로 이뤄진다. 보기 형식(`view`)에 따라 순공 또는 공부 시간을 보인다.
 * 집중하지 않는 동안은 라벨 자리를 상태 문구로 바꾸고 숫자를 회색으로 둔다. 순공 보기에서는 숫자가 멈춘다.
 * 유예는 순공이 흐르는 상태라 문구와 숫자를 흰색으로 두고 2초 주기로 옅어지게만 한다.
 * 심플 모드는 숫자와 비집중 문구를 상태색으로 칠하고 숫자에 발광을 넣는다.
 * 상태 문구는 자동 감지로 바뀌므로 라이브 리전으로 읽힌다. 심플 모드는 오늘 줄을 숨긴다.
 */
export function SessionClock({
  view,
  studySec,
  focusSec,
  todayStudySec,
  todayFocusSec,
  state,
  statusLabel,
  simple,
  callouts,
  fake = false,
  corner = false,
}: SessionClockProps) {
  const { t } = useTranslation("study-session");
  const focusView = view === "focus";
  // 카메라가 없는 심플 모드는 숫자를 상태색(집중·유예 파랑, 비집중 주황, 일시정지 회색)과 발광으로 보인다.
  const stateColored = simple && !corner;
  const sessionSec = focusView ? focusSec : studySec;
  const todaySec = focusView ? todayFocusSec : todayStudySec;
  const label = focusView ? t("clock.currentFocus") : t("clock.currentStudy");
  const shown: ShownLabel = {
    key: state === "focus" ? `focus-${view}` : `${state}-${statusLabel}`,
    text: state === "focus" ? label : statusLabel,
    tone:
      state === "focus"
        ? corner
          ? "text-white/80"
          : "text-white/60"
        : state === "grace"
          ? "text-white/85"
          : state === "distract" && stateColored
            ? "text-(--state-distract)"
            : "text-text-tertiary",
  };
  // 문구가 바뀐 렌더에서 앞 문구를 붙잡아 두고, 사라지는 애니메이션이 끝나면 놓는다.
  const [current, setCurrent] = useState(shown);
  const [leaving, setLeaving] = useState<ShownLabel | null>(null);
  if (current.key !== shown.key) {
    setLeaving(current);
    setCurrent(shown);
  }
  const statusText = (
    <p
      role={fake ? undefined : "status"}
      aria-live={fake ? undefined : "polite"}
      aria-hidden={fake || undefined}
      className={cn(
        // 겹친 두 문구는 칸 폭이 긴 문구에 맞춰지므로, 짧은 문구도 같은 자리에서 떠오르게 칸 안에서도 정렬을 맞춘다.
        "grid text-xs leading-4 regular:text-sm regular:leading-5",
        corner ? "justify-items-start" : "justify-items-center",
        state === "grace" && GRACE_LABEL_PULSE,
      )}
    >
      {/* 라이브 리전은 바깥 p라 새 문구만 읽힌다. 사라지는 문구는 읽지 않는다. */}
      {leaving !== null && (
        <span
          key={`leaving-${leaving.key}`}
          aria-hidden="true"
          onAnimationEnd={() => setLeaving(null)}
          className={cn(
            LABEL_SLOT,
            "animate-out fill-mode-forwards fade-out-0 motion-reduce:hidden",
            leaving.tone,
          )}
        >
          {leaving.text}
        </span>
      )}
      <span key={shown.key} className={cn(LABEL_SLOT, "animate-in fade-in-0", shown.tone)}>
        {shown.text}
      </span>
    </p>
  );
  // 유예에도 순공은 흐르므로 숫자는 흰색(심플 모드는 상태색)으로 두고, 멈춘 동안만 회색으로 둔다.
  const numberColor = cn(
    stateColored
      ? "text-(--session-state-color)"
      : state === "focus" || state === "grace"
        ? "text-white"
        : "text-text-tertiary",
    state === "grace" && GRACE_NUMBER_PULSE,
  );
  const sessionTime = (
    <>
      <span aria-hidden="true">{formatElapsed(sessionSec)}</span>
      <span className="sr-only">
        {t(focusView ? "clock.srFocus" : "clock.srStudy", {
          duration: toKoreanDuration(sessionSec),
        })}
      </span>
    </>
  );
  const todayLine = !simple && (
    <p
      aria-hidden={fake || undefined}
      className={cn(
        "text-[15px] leading-4.5 font-medium whitespace-nowrap text-white/42 tabular-nums regular:text-[1.375rem] regular:leading-7",
        corner ? "mt-1.5" : "mt-1.75 text-center landscape-compact:mt-1.25",
      )}
    >
      <span aria-hidden="true">
        <span className="font-normal">
          {t(focusView ? "clock.todayFocus" : "clock.todayStudy")}
        </span>
        {"\u00a0 "}
        <span className="text-white">{formatElapsed(todaySec)}</span>
      </span>
      <span className="sr-only">
        {t(focusView ? "clock.srTodayFocus" : "clock.srTodayStudy", {
          duration: toKoreanDuration(todaySec),
        })}
      </span>
    </p>
  );
  if (corner) {
    return (
      <div className={cn("flex flex-col items-start gap-0.5", CORNER_SHADOW)}>
        {statusText}
        <div className="relative">
          <p
            data-testid="session-clock-number"
            aria-hidden={fake || undefined}
            className={cn(
              "text-5xl leading-14 font-bold tracking-[-0.5px] tabular-nums regular:text-[64px] regular:leading-18",
              STATE_COLOR_EASE,
              numberColor,
            )}
          >
            {sessionTime}
          </p>
          {callouts?.number}
        </div>
        {todayLine}
      </div>
    );
  }
  return (
    <div className="relative flex flex-col items-center [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]">
      <div className="relative flex items-center">
        {callouts?.caption}
        {statusText}
      </div>
      <div className="relative mt-1 landscape-compact:mt-0.5">
        <p
          data-testid="session-clock-number"
          aria-hidden={fake || undefined}
          className={cn(
            "text-center",
            NUMBER_SIZE,
            STATE_COLOR_EASE,
            simple
              ? "landscape-compact:text-[72px] landscape-compact:leading-20"
              : "landscape-compact:text-[44px] landscape-compact:leading-13",
            numberColor,
          )}
          style={stateColored ? { textShadow: GLOW_TEXT_SHADOW } : undefined}
        >
          {sessionTime}
        </p>
        {callouts?.number}
      </div>
      {todayLine}
    </div>
  );
}
