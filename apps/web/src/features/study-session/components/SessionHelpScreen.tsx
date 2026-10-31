import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Music, Pause } from "lucide-react";

import awayPhoto from "@/assets/guide/session-away-photo.jpg";
import helpPhoto from "@/assets/guide/session-help-photo.jpg";
import simpleModeScreen from "@/assets/guide/session-simple-mode.png";
import simpleModeLandscape from "@/assets/guide/session-simple-mode-landscape.png";
import handTap from "@/assets/guide/hand-tap.svg";
import moreIcon from "@/assets/icons/session-more.svg";
import { Badge } from "@/components/ui/badge";
import { TimerIcon } from "@/features/multi-timer/icons";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { CONTROL_ICON_SIZE } from "@/features/study-session/components/SessionControlButtons";
import { SOLO_MORE_POSITION } from "@/features/study-session/components/SessionMoreMenu";
import {
  SESSION_SIDE_GAP,
  SESSION_SIDE_POSITION,
} from "@/features/study-session/components/SessionSideActions";
import { SESSION_PILL_SIZE } from "@/features/study-session/components/SessionStatusPill";
import {
  TIMER_FOCUS_LANDSCAPE,
  TIMER_FOCUS_SIZE,
  TIMER_TOTAL_TEXT,
} from "@/features/study-session/components/SessionTimer";
import { formatElapsed } from "@/features/study-session/formatDuration";
import type { SessionHelpCallout, SessionHelpStep } from "@/features/study-session/sessionHelpCopy";
import { SESSION_HELP_NAV, SESSION_HELP_STEPS } from "@/features/study-session/sessionHelpCopy";
import { SESSION_LAYER_INSET } from "@/features/study-session/sessionLayout";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

const GRADIENT_TEXT =
  "bg-(image:--gradient-brand-text) box-decoration-clone bg-clip-text text-transparent";
/** 설명 글(20/28, Medium). 가운데 문구도 같은 크기다. */
const CALLOUT_TEXT = "text-xl leading-7 font-medium break-keep text-primary-foreground/90";
/**
 * 강조 요소를 감싸는 연한 회색 테두리(다크 전용 화면이라 흰색 60%가 회색으로 보인다). 요소 둘레에 5px 여유를 둔다.
 * 테두리만 그려서 요소 위에 겹쳐도 가리지 않는다. 화살표는 이 테두리 밖 3px에서 시작한다.
 */
const RING = "pointer-events-none absolute -inset-1.25 border-[1.5px] border-primary-foreground/60";
/** 가짜 유리 버튼. 바탕 클래스의 pointer-events-auto를 덮어 덮개 탭이 그대로 다음 단계로 간다. */
const FAKE_BUTTON = "pointer-events-none";

/** 문구에서 핵심 단어만 그라데이션 글자로 감싼다. 단어에 정규식 특수 문자가 없다고 본다. */
function highlight(text: string, words: readonly string[]): ReactNode[] {
  return text.split(new RegExp(`(${words.join("|")})`)).map((part, index) =>
    words.includes(part) ? (
      <span key={index} className={GRADIENT_TEXT}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** 흰 점선 화살표. 몸통만 점선이고 화살촉은 실선이다. */
function Arrow({
  viewBox,
  body,
  head,
  className,
}: {
  viewBox: string;
  body: string;
  head: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 text-primary-foreground/90", className)}
    >
      <path d={body} strokeDasharray="4 4" />
      <path d={head} />
    </svg>
  );
}

/**
 * 화면을 톡 누르는 손(Figma 7596:14576에서 내보낸 SVG, 50×68). iPhone SE 높이에 들어가게 같은 비율로 38×52로 줄였다.
 * SVG가 currentColor로 그려져 있어 `<img>`로는 색이 들어가지 않으므로 마스크로 찍고 글자색 토큰으로 칠한다.
 */
function TapHandIcon({ className }: { className?: string }) {
  // Vite가 작은 SVG를 data URL로 넣어서 공백이 섞이므로 따옴표로 감싼다.
  const mask = `url("${handTap}") center / contain no-repeat`;
  return (
    <span
      aria-hidden
      style={{ mask, WebkitMask: mask }}
      data-testid="tap-hand"
      className={cn("block h-13 w-9.5 bg-primary-foreground", className)}
    />
  );
}

/** 설명 문구. 핵심 단어를 칠하고 문구 안 줄바꿈은 그대로 둔다. */
function CalloutText({ callout, className }: { callout: SessionHelpCallout; className?: string }) {
  return (
    <p className={cn(CALLOUT_TEXT, "whitespace-pre-line", className)}>
      {highlight(callout.text, callout.highlight)}
    </p>
  );
}

/** 가짜 타이머 시작값(01:24:08, 01:45:12) */
const FOCUS_START_SEC = 5048;
const TOTAL_START_SEC = 6312;

/**
 * 가짜 순공 타이머와 총 공부
 *
 * 단계마다 다시 마운트되어 시작값에서 1초씩 올라간다. 실제 타이머가 아니라 낭독기에서 숨기고 `role="timer"`도 두지 않는다.
 * 모션 줄이기를 켜면 숫자를 멈춘다.
 */
function FakeTimer({ ticking }: { ticking: SessionHelpStep["ticking"] }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (ticking === undefined || prefersReducedMotion()) {
      return;
    }
    const id = window.setInterval(() => setElapsed((sec) => sec + 1), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  const focusSec = FOCUS_START_SEC + (ticking === "both" ? elapsed : 0);
  return (
    <div aria-hidden className="flex flex-col items-center">
      <span className={cn(TIMER_FOCUS_SIZE, TIMER_FOCUS_LANDSCAPE, "text-primary-foreground")}>
        {formatElapsed(focusSec)}
      </span>
      <span className={TIMER_TOTAL_TEXT}>총 {formatElapsed(TOTAL_START_SEC + elapsed)}</span>
    </div>
  );
}

/** 하단 이동 버튼(이전·다음). 16px Bold */
const NAV_BUTTON =
  "flex min-h-11 items-center rounded-md px-1 text-base leading-6 font-bold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70";

/**
 * 심플 모드 그림 틀. 안전 영역 사이에 그림을 contain으로 담고, 그림 속 좌표를 `--s`(그림 1px의 화면 길이)로 환산한다.
 * 그림은 세로 402×874, 가로 874×402다. 그림 층과 설명 층이 같은 틀을 써서 테두리가 그림 속 필에 맞는다.
 */
const SIMPLE_FRAME =
  "absolute inset-x-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] @container-size [--s:min(100cqw/402,100cqh/874)] landscape-compact:inset-y-0 landscape-compact:right-[env(safe-area-inset-right)] landscape-compact:left-[env(safe-area-inset-left)] landscape-compact:[--s:min(100cqw/874,100cqh/402)]";

const PILL = {
  distract: { variant: "session-distract", label: "자리를 비운 것 같아요" },
  focus: { variant: "session-focus", label: "순공시간 측정 중" },
} as const;

/**
 * 첫 세션 도움말 퍼널(6단계)
 *
 * 단계마다 배경 사진과 덮개 위에 그 단계의 세션 요소만 실제 자리에 정적으로 다시 그리고, 연한 회색 테두리와 점선 화살표로 설명한다.
 * 단계 목록과 문구는 `SESSION_HELP_STEPS`(설계 문서 "세션 도움말 퍼널" 절)가 정한다.
 * 실제 컴포넌트를 쓰지 않는 이유는 상태 필의 라이브 리전과 앱 glass 버튼 등록이 따라오기 때문이다.
 * 자리와 크기는 실제 요소와 같은 상수를 쓴다. 하단 버튼 줄은 실제 세션 레이어와 같은 여백(`SESSION_LAYER_INSET`) 안에 둔다.
 * 앱 glass 버튼은 떠 있는 동안 호출부가 faded로 감춰서 여기 그린 가짜 요소만 보인다.
 *
 * 오른쪽 아래 `다음 >`이나 덮개 탭으로 다음 단계로 가고, 마지막 단계의 `순공 시작하기 >`에서 닫는다. 건너뛰기 버튼은 없다.
 * 키보드 사용자를 위해 Escape는 바로 닫는다.
 * 끝까지 본 것(`onComplete`)과 중간에 닫은 것(`onDismiss`)을 나눠 알린다. 호출부는 끝까지 본 계정에만 다시 띄우지 않는다.
 *
 * `aria-modal`을 붙이지 않는다. 붙이면 `nativeModalOverlay`가 모달로 읽어 glass 층 전체를 숨긴다.
 * 덮개 뒤 실제 버튼은 호출부가 `inert`로 막는다. 모달이 아니라 낭독기가 뜬 것을 모르므로 뜰 때와 단계를 넘길 때 루트에 초점을 두고,
 * 닫히면 열기 전 초점(더보기 버튼 등)으로 돌려준다.
 */
export function SessionHelpScreen({
  onComplete,
  onDismiss,
  returnFocus = null,
  step: controlledStep,
  onStepChange,
}: {
  /** 마지막 단계에서 `순공 시작하기`나 덮개 탭으로 끝까지 봤다. */
  onComplete: () => void;
  /** Escape로 중간에 닫았다. */
  onDismiss: () => void;
  /**
   * 지금 단계(0부터). 다른 화면에 가려 내렸다가 다시 띄울 때 같은 단계로 돌아오도록 호출부가 들고 있을 수 있다.
   * 넘기지 않으면 스스로 들고 1단계부터 시작한다.
   */
  step?: number;
  onStepChange?: (step: number) => void;
  /**
   * 닫힐 때 초점을 돌려줄 요소. 메뉴 항목으로 열면 뜰 때 초점이 이미 사라진 항목에 있어서 호출부가 더보기 버튼을 넘긴다.
   * 넘기지 않으면 뜰 때 초점이 있던 요소로 돌려준다.
   */
  returnFocus?: HTMLElement | null;
}) {
  const [ownStep, setOwnStep] = useState(0);
  const stepIndex = controlledStep ?? ownStep;
  const setStepIndex = onStepChange ?? setOwnStep;
  const step = SESSION_HELP_STEPS[stepIndex];
  const isLast = stepIndex === SESSION_HELP_STEPS.length - 1;
  const { callouts } = step;

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = returnFocus ?? document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) {
        opener.focus();
      }
    };
  }, [returnFocus]);
  useEffect(() => {
    rootRef.current?.focus();
  }, [stepIndex]);

  const advance = () => {
    if (isLast) {
      onComplete();
    } else {
      setStepIndex(stepIndex + 1);
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="세션 도움말"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onDismiss();
        }
      }}
      className="fixed inset-0 z-40 overflow-hidden bg-background outline-none animate-[coach-fade-in_200ms_ease-out] motion-reduce:animate-none"
    >
      {step.background === "simple" ? (
        // 심플 모드 화면 그림은 화면 자체가 설명이라 옅은 덮개만 깐다. 위아래(가로는 좌우) 안전 영역 사이에 그림 전체가 보이게 담고
        // 남는 자리는 바탕색이다. 가로는 가로 전용 그림(Figma 5521:5139)으로 바꾼다. 매체 조건은 `landscape-compact`와 같다.
        <div className={SIMPLE_FRAME}>
          <picture>
            <source
              media="((orientation: landscape) and (height < 30rem))"
              srcSet={simpleModeLandscape}
            />
            <img
              src={simpleModeScreen}
              alt=""
              aria-hidden
              className="absolute inset-0 size-full object-contain"
            />
          </picture>
        </div>
      ) : (
        // 세로 화면 전체에 cover하면 사진(3:4)을 크게 키워 사람 윤곽이 잘린다. 화면 높이 80% 상자에 담아 상반신과 책상이 보이게 하고,
        // 위아래 남는 띠는 바탕색으로 둔다. 가로는 상자가 낮아 전체 cover를 유지한다.
        <img
          src={step.background === "away" ? awayPhoto : helpPhoto}
          alt=""
          aria-hidden
          className="absolute inset-x-0 top-[10%] h-4/5 w-full object-cover landscape-compact:inset-y-0 landscape-compact:h-full"
        />
      )}
      {/* 덮개 아무 데나 누르면 다음 단계로 간다. 낭독기와 Tab에는 아래 다음 버튼 하나만 남긴다. */}
      <button
        type="button"
        aria-label="다음 안내"
        aria-hidden
        tabIndex={-1}
        onClick={advance}
        className={cn(
          "absolute inset-0 cursor-default outline-none",
          step.background === "simple" ? "bg-(--dim)" : "bg-(--coach-dim)",
        )}
      />

      {/* 아래부터는 누름을 받지 않아 탭이 덮개로 내려간다. */}
      <div className="pointer-events-none absolute inset-0">
        {callouts.pill && step.pill !== undefined && (
          <>
            {/* 상태 필: 세션 레이어의 위 여백과 같은 자리.
                화살표는 필 왼쪽 반원의 테두리 밖 3px(필 중심보다 조금 아래)에서 왼쪽으로 나가 둥글게 꺾여 설명 위로 내려간다. */}
            <div className="absolute top-[calc(env(safe-area-inset-top)+13px)] left-1/2 flex -translate-x-1/2 landscape-compact:top-[calc(env(safe-area-inset-top)+18px)]">
              <Badge variant={PILL[step.pill].variant} aria-hidden className={SESSION_PILL_SIZE}>
                {PILL[step.pill].label}
              </Badge>
              <span aria-hidden className={cn(RING, "rounded-full")} />
              <Arrow
                viewBox="0 0 24 32"
                body="M23 1C10 1 4 4 4 14V28"
                head="M0 23L4 28L8 23"
                className="absolute top-[calc(50%+6px)] right-[calc(100%+6px)] h-8 w-6"
              />
            </div>
            {/* 설명 블록은 화면 가로 가운데, 문구는 왼쪽 정렬. 위 끝 = 필 아래 끝(36, 39, 48px 높이) + 24px */}
            <CalloutText
              callout={callouts.pill}
              className="absolute top-[calc(env(safe-area-inset-top)+73px)] left-1/2 -translate-x-1/2 whitespace-pre regular:top-[calc(env(safe-area-inset-top)+76px)] short-side-lg:top-[calc(env(safe-area-inset-top)+85px)] landscape-compact:top-[calc(env(safe-area-inset-top)+78px)]"
            />
          </>
        )}

        {callouts.more && (
          // 더보기 버튼(옮긴 자리)과 테두리
          <div className={cn(SOLO_MORE_POSITION, "flex size-11 items-center justify-center")}>
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-full bg-(--session-bar-glass-bg) shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]"
            >
              <img src={moreIcon} alt="" className="h-1 w-4.5" />
            </span>
            {/* 보이는 원(32px) 둘레 5px. 누르는 영역(44px)보다 사방 1px 안쪽이다. */}
            <span aria-hidden className={cn(RING, "inset-px rounded-full")} />
            {/* 테두리 왼쪽 밖 3px에서 왼쪽으로 짧게 나간 뒤 아래로 둥글게 꺾인다. 끝은 왼쪽 아래로 살짝 틀었다. */}
            <Arrow
              viewBox="0 0 24 100"
              body="M23 1Q3 1 3 22V82Q3 89 0.3 94"
              head="M6.7 90.6L0.3 94L-0.4 86.8"
              className="absolute top-1/2 right-[calc(100%+2px)] h-25 w-6 overflow-visible"
            />
            {/* 설명은 꺾쇠 바로 아래 8px(버튼 가운데 + 화살표 96px + 8px), 오른쪽 끝을 꺾쇠 끝에 맞춘다. */}
            <CalloutText
              callout={callouts.more}
              className="absolute top-[calc(100%+82px)] right-[calc(100%+14px)] text-right whitespace-pre"
            />
          </div>
        )}

        {callouts.side && (
          // 사이드 버튼 세 개. 설명은 가운데(과목) 버튼을 가리킨다.
          <div className={SESSION_SIDE_POSITION}>
            <span aria-hidden className={cn(RING, "rounded-full")} />
            <div aria-hidden className={cn("flex flex-col", SESSION_SIDE_GAP)}>
              <span className={cn(controlButtonVariants(), FAKE_BUTTON)}>
                <Music className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
              </span>
              <span className={cn(controlButtonVariants(), FAKE_BUTTON)}>
                <BookOpen className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
              </span>
              <span className={cn(controlButtonVariants(), FAKE_BUTTON)}>
                <TimerIcon className="size-7 regular:size-8.25 short-side-lg:size-10.25" />
              </span>
            </div>
            {/* 화살표는 과목 버튼 중심(버튼 지름 + 간격 + 지름의 절반: 93, 110, 138px) 높이의
                테두리(열 왼쪽 5px) 밖 3px에서 시작해 아래 설명으로 둥글게 내려간다.
                설명은 중심 + 24px에서 시작해 열 왼쪽 8px 앞에 오른쪽 정렬한다(20px 두 줄이 SE 폭에 들어가게). */}
            <Arrow
              viewBox="0 0 24 24"
              body="M20 4Q4 6 2 20"
              head="M-0.5 16L2 20L5 16.5"
              className="absolute top-22.25 right-[calc(100%+4px)] h-6 w-6 overflow-visible regular:top-26.5 short-side-lg:top-33.5"
            />
            <CalloutText
              callout={callouts.side}
              className="absolute top-29.25 right-[calc(100%+8px)] text-right whitespace-pre regular:top-33.5 short-side-lg:top-40.5"
            />
          </div>
        )}

        {callouts.center && (
          // 심플 모드 단계의 문구는 그림 속 타이머 아래에 둔다. 그림 좌표(세로 그림 기준, 가로는 landscape-compact 값)를 `--s`로 환산한다.
          // 그림 속 타이머 아래 끝: 세로 y 460 / 가로 y 252. 좁은 화면에서 한 줄이 넘치면 두 줄로 고르게 나눈다.
          <div className={SIMPLE_FRAME}>
            <div className="absolute inset-x-4 top-[calc(50%+23*var(--s)+20px)] flex flex-col items-center gap-3 landscape-compact:top-[calc(50%+51*var(--s)+16px)]">
              <CalloutText callout={callouts.center} className="text-center text-balance" />
              <TapHandIcon />
            </div>
          </div>
        )}

        {callouts.timer && (
          // 타이머: 하단 버튼 줄 바로 위. 줄 아래 여백 + 버튼 높이(60, 72, 88px) + 줄 위 간격(8, 10, 12px)만큼 띄운다.
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+76px)] left-1/2 flex -translate-x-1/2 flex-col items-center regular:bottom-[calc(env(safe-area-inset-bottom)+106px)] short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+127px)] landscape-compact:bottom-[max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))]">
            <FakeTimer key={step.id} ticking={step.ticking} />
            {/* 숫자 블록 위 끝 가운데 3px 위에서 곧게 올라간다. 설명은 타이머에서 세 줄 높이(66px)쯤 더 띄운다.
                한 줄이 화면보다 넓으면 두 줄로 고르게 나눈다. */}
            <div className="absolute bottom-full left-1/2 mb-0.75 flex w-max max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col items-center">
              <CalloutText callout={callouts.timer} className="text-center text-balance" />
              <Arrow
                viewBox="0 0 16 86"
                body="M8 85V2"
                head="M4 6L8 2L12 6"
                className="h-21.5 w-4"
              />
            </div>
          </div>
        )}

        {callouts.pause && (
          // 일시정지: 실제 세션 레이어와 같은 여백 안의 왼쪽 아래.
          <div className={cn("absolute inset-0 flex items-end", SESSION_LAYER_INSET)}>
            <div
              className={cn(controlButtonVariants({ size: "primary" }), FAKE_BUTTON, "relative")}
            >
              <Pause aria-hidden fill="currentColor" className={CONTROL_ICON_SIZE} />
              <span aria-hidden className={cn(RING, "rounded-full")} />
              {/* 테두리 위 끝 가운데 밖 3px에서 올라가다 왼쪽 모서리를 둥글게 돌아 오른쪽 설명으로 간다.
                  설명은 버튼 오른쪽 28px, 아래 끝이 버튼 위 8px(버튼 높이 가운데보다 약 60px 위)이다. */}
              <Arrow
                viewBox="0 0 58 26"
                body="M1 25C1 10 6 4 18 4H53"
                head="M49 0L54 4L49 8"
                className="absolute bottom-[calc(100%+8px)] left-[calc(50%-1px)] h-6.5 w-14.5 overflow-visible"
              />
              <CalloutText
                callout={callouts.pause}
                className="absolute bottom-[calc(100%+8px)] left-[calc(100%+28px)] w-48"
              />
            </div>
          </div>
        )}
      </div>

      {/* 오른쪽 아래 한 줄: 이전(2단계부터) · 진행도 · 다음. 하단 버튼 줄 높이 가운데(줄 아래 여백 + 버튼 지름 절반 - 22px)에 둔다.
          화살표는 글자로 붙이고 낭독기에서 뺀다. */}
      <div className="absolute right-[calc(env(safe-area-inset-right)+20px)] bottom-[calc(env(safe-area-inset-bottom)+16px)] flex items-center regular:bottom-[calc(env(safe-area-inset-bottom)+38px)] short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+49px)] landscape-compact:bottom-[calc(max(env(safe-area-inset-bottom),calc((env(safe-area-inset-bottom)+14px)/2))+8px)]">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex(stepIndex - 1)}
            className={cn(NAV_BUTTON, "mr-4")}
          >
            <span aria-hidden className="whitespace-pre">
              {"< "}
            </span>
            {SESSION_HELP_NAV.prev}
          </button>
        )}
        <span className="mr-3 text-sm leading-5 text-primary-foreground/70 tabular-nums">
          {stepIndex + 1}/{SESSION_HELP_STEPS.length}
        </span>
        <button type="button" onClick={advance} className={NAV_BUTTON}>
          {isLast ? SESSION_HELP_NAV.finish : SESSION_HELP_NAV.next}
          <span aria-hidden className="whitespace-pre">
            {" >"}
          </span>
        </button>
      </div>
    </div>
  );
}
