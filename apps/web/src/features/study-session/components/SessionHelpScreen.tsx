import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Music, Pause } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import handTap from "@/assets/guide/hand-tap.svg";
import helpPhoto from "@/assets/guide/session-help-photo.jpg";
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
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import type { SessionHelpStep, SessionHelpTextKey } from "@/features/study-session/sessionGuide";
import { SESSION_HELP_STEPS } from "@/features/study-session/sessionGuide";
import { SESSION_LAYER_INSET } from "@/features/study-session/sessionLayout";
import { sessionGlowStyle } from "@/features/study-session/sessionTheme";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

const GRADIENT_TEXT =
  "bg-(image:--gradient-brand-text) box-decoration-clone bg-clip-text text-transparent";
/** 설명 글(20/28, Medium) */
const CALLOUT_TEXT = "text-xl leading-7 font-medium break-keep text-primary-foreground/90";
/**
 * 강조 요소를 감싸는 연한 회색 테두리(다크 전용 화면이라 흰색 60%가 회색으로 보인다). 요소 둘레에 5px 여유를 둔다.
 * 테두리만 그려서 요소 위에 겹쳐도 가리지 않는다. 화살표는 이 테두리 밖 3px에서 시작한다.
 */
const RING = "pointer-events-none absolute -inset-1.25 border-[1.5px] border-primary-foreground/60";
/** 가짜 유리 버튼. 바탕 클래스의 pointer-events-auto를 덮어 덮개 탭이 그대로 다음 단계로 간다. */
const FAKE_BUTTON = "pointer-events-none";

/** 문구의 `<hl>` 핵심 단어만 그라데이션 글자로 감싼다. */
function HelpText({ textKey }: { textKey: SessionHelpTextKey }) {
  const { t } = useTranslation("study-session");
  return <Trans t={t} i18nKey={textKey} components={{ hl: <span className={GRADIENT_TEXT} /> }} />;
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
 * 화면을 톡 누르는 손(50×68 SVG). iPhone SE 높이에 들어가게 같은 비율로 38×52로 줄였다.
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
function CalloutText({ callout, className }: { callout: SessionHelpTextKey; className?: string }) {
  return (
    <p className={cn(CALLOUT_TEXT, "whitespace-pre-line", className)}>
      <HelpText textKey={callout} />
    </p>
  );
}

/** 가짜 순공 숫자 시작값(01:24:08) */
const FOCUS_START_SEC = 5048;

/**
 * 가짜 순공 숫자
 *
 * 심플 모드의 발광 숫자를 실제 타이머 컴포넌트로 그려서 크기·발광·가로 크기가 실제와 같다.
 * 단계마다 다시 마운트되어 시작값에서 다시 센다.
 * 모션 줄이기를 켜면 숫자를 멈춘다.
 */
function FakeFocusTimer({ ticking }: { ticking: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!ticking || prefersReducedMotion()) {
      return;
    }
    const id = window.setInterval(() => setElapsed((sec) => sec + 1), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  return <SessionTimer focusSec={FOCUS_START_SEC + elapsed} studySec={0} state="focus" glow />;
}

const PILL = {
  distract: { variant: "session-distract", label: "status.away" },
  focus: { variant: "session-focus", label: "status.focus" },
} as const;

/** 가짜 일시정지 버튼. 테두리·화살표·설명은 children으로 받는다. */
function FakePauseButton({ children }: { children?: ReactNode }) {
  return (
    <div className={cn(controlButtonVariants({ size: "primary" }), FAKE_BUTTON, "relative")}>
      <Pause aria-hidden fill="currentColor" className={CONTROL_ICON_SIZE} />
      {children}
    </div>
  );
}

/**
 * 상태 필 설명
 *
 * 세로는 필 왼쪽에서 둥글게 꺾여 내려가는 화살표 아래에 문구 블록을 화면 가운데로 두고 글은 왼쪽 정렬한다.
 * 가로는 위아래 자리가 없어 필 오른쪽에 짧은 화살표와 문구를 둔다.
 * 가로에서 세 줄 이상이면 필 높이 가운데에 맞추면 윗줄이 화면 밖으로 밀려서 필 위 끝에 맞춘다.
 */
function PillCallout({ callout }: { callout: SessionHelpTextKey }) {
  const { t } = useTranslation("study-session");
  const tall = t(callout).split("\n").length > 2;
  return (
    <>
      <span aria-hidden className={cn(RING, "rounded-full")} />
      <Arrow
        viewBox="0 0 24 44"
        body="M23 1C10 1 4 4 4 18V40"
        head="M0 35L4 40L8 35"
        className="absolute top-[calc(50%+6px)] right-[calc(100%+6px)] h-11 w-6 landscape-compact:hidden"
      />
      <Arrow
        viewBox="0 0 20 8"
        body="M0 4H18"
        head="M15 0.5L19 4L15 7.5"
        className="absolute top-1/2 left-[calc(100%+8px)] hidden h-2 w-5 -translate-y-1/2 landscape-compact:block"
      />
      <CalloutText
        callout={callout}
        className={cn(
          "absolute top-[calc(100%+34px)] left-1/2 -translate-x-1/2 whitespace-pre landscape-compact:left-[calc(100%+36px)] landscape-compact:translate-x-0",
          tall
            ? "landscape-compact:top-0"
            : "landscape-compact:top-1/2 landscape-compact:-translate-y-1/2",
        )}
      />
    </>
  );
}

/**
 * 순공 숫자 설명
 *
 * 세로는 숫자 아래로 곧게 내려가는 화살표 밑에 가운데 정렬로 둔다.
 * 가로는 숫자 왼쪽에 오른쪽 정렬로 두고 화살표가 숫자를 향한다.
 */
function TimerCallout({ callout }: { callout: SessionHelpTextKey }) {
  return (
    <div className="absolute top-full left-1/2 flex w-max max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col items-center pt-2 landscape-compact:top-1/2 landscape-compact:right-full landscape-compact:left-auto landscape-compact:max-w-none landscape-compact:translate-x-0 landscape-compact:-translate-y-1/2 landscape-compact:flex-row-reverse landscape-compact:pt-0 landscape-compact:pr-2.5">
      <Arrow
        viewBox="0 0 16 36"
        body="M8 1V33"
        head="M4 29L8 34L12 29"
        className="h-9 w-4 landscape-compact:hidden"
      />
      <Arrow
        viewBox="0 0 20 8"
        body="M20 4H2"
        head="M5 0.5L1 4L5 7.5"
        className="hidden h-2 w-5 landscape-compact:block"
      />
      <CalloutText
        callout={callout}
        // 숫자 왼쪽 자리가 좁아 가로에서만 문구의 줄바꿈을 살리고 세로에서는 공백으로 접는다.
        className="mt-2 text-center text-balance whitespace-normal landscape-compact:mt-0 landscape-compact:mr-3 landscape-compact:text-right landscape-compact:whitespace-pre-line"
      />
    </div>
  );
}

/**
 * 화면 탭 설명
 *
 * 세로는 숫자 아래 한 줄로 두고, 가로는 숫자 왼쪽 빈 자리에 두 줄로 둔다.
 * 문구의 줄바꿈을 세로에서는 공백으로 접는다.
 */
function TapCallout({ callout }: { callout: SessionHelpTextKey }) {
  return (
    <div className="absolute top-full left-1/2 mt-7 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-3 landscape-compact:top-1/2 landscape-compact:right-full landscape-compact:left-auto landscape-compact:mt-0 landscape-compact:mr-12 landscape-compact:translate-x-0 landscape-compact:-translate-y-1/2">
      <CalloutText
        callout={callout}
        className="text-center text-balance whitespace-normal landscape-compact:whitespace-pre-line"
      />
      <TapHandIcon />
    </div>
  );
}

/**
 * 심플 모드 화면
 *
 * 실제 세션 레이어와 같은 여백·배치로 상태 필, 과목 줄, 발광 숫자, 일시정지 버튼을 그려서 설명이 실제 자리를 가리킨다.
 * 상태 필만 실제 컴포넌트가 아니다. 실제 필은 라이브 리전이라 낭독기가 가짜 상태를 읽는다.
 * 상태 색은 실제 세션 상태가 아니라 단계가 정해서, 이 화면 안에서만 발광 색 변수를 덮어쓴다.
 * 탭 설명 단계는 덮개 대신 가짜 요소를 옅게 해서 가운데 문구만 또렷하게 둔다.
 */
function SimpleModeBackdrop({ step }: { step: SessionHelpStep }) {
  const { t } = useTranslation("study-session");
  const state = step.state ?? "focus";
  const { pill, timer, tap } = step.callouts;
  const dimmed = tap !== undefined && "opacity-40";
  return (
    <div
      style={sessionGlowStyle(state === "distract" ? "DISTRACTION" : "FOCUS")}
      className="absolute inset-0"
    >
      <SimpleModeSurface glowKey={step.id} />
      <div className={cn("absolute inset-0 flex flex-col items-center", SESSION_LAYER_INSET)}>
        <div className={cn("relative flex", dimmed)}>
          <Badge variant={PILL[state].variant} aria-hidden className={SESSION_PILL_SIZE}>
            {t(PILL[state].label)}
          </Badge>
          {pill && <PillCallout callout={pill} />}
        </div>
        {/* 세로는 실제 심플 모드처럼 두 스페이서가 필과 아래 버튼 줄 사이 가운데에 숫자 묶음을 둔다.
            가로는 실제 화면처럼 숫자 묶음을 화면 가운데에 띄운다. */}
        <div className="grow landscape-compact:hidden" />
        <div className="relative flex flex-col items-center landscape-compact:absolute landscape-compact:top-1/2 landscape-compact:left-1/2 landscape-compact:-translate-x-1/2 landscape-compact:-translate-y-1/2">
          {/* 실제 심플 모드의 과목 줄은 설명에 쓰이지 않아 그리지 않는다. 숫자 하나에 시선을 모은다. */}
          <div className="relative">
            <div aria-hidden className={cn(dimmed)}>
              <FakeFocusTimer key={step.id} ticking={step.ticking === true} />
            </div>
            {timer && <TimerCallout callout={timer} />}
            {tap && <TapCallout callout={tap} />}
          </div>
        </div>
        <div className="grow landscape-compact:hidden" />
        <div
          className={cn(
            "mt-2 flex w-full regular:mt-2.5 short-side-lg:mt-3 landscape-compact:mt-auto",
            dimmed,
          )}
        >
          <FakePauseButton />
        </div>
      </div>
    </div>
  );
}

/** 사이드 버튼 세 개와 설명. 설명은 가운데(과목) 버튼을 가리킨다. */
function SideCallout({ callout }: { callout: SessionHelpTextKey }) {
  return (
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
      {/* 세로: 과목 버튼 중심(버튼 지름 + 간격 + 지름의 절반: 93, 110, 138px) 높이의 테두리 밖 3px에서 아래 설명으로 둥글게 내려간다.
          설명은 중심 + 24px에서 시작해 열 왼쪽 8px 앞에 오른쪽 정렬한다.
          가로: 과목 버튼 중심 높이에서 왼쪽으로 곧게 나가고 설명을 그 높이 가운데에 둔다. */}
      <Arrow
        viewBox="0 0 24 24"
        body="M20 4Q4 6 2 20"
        head="M-0.5 16L2 20L5 16.5"
        className="absolute top-22.25 right-[calc(100%+4px)] h-6 w-6 overflow-visible regular:top-26.5 short-side-lg:top-33.5 landscape-compact:hidden"
      />
      <Arrow
        viewBox="0 0 20 8"
        body="M20 4H2"
        head="M5 0.5L1 4L5 7.5"
        className="absolute top-23.25 right-[calc(100%+8px)] hidden h-2 w-5 -translate-y-1/2 landscape-compact:block"
      />
      <CalloutText
        callout={callout}
        className="absolute top-29.25 right-[calc(100%+8px)] text-right whitespace-pre regular:top-33.5 short-side-lg:top-40.5 landscape-compact:top-23.25 landscape-compact:right-[calc(100%+36px)] landscape-compact:-translate-y-1/2"
      />
    </div>
  );
}

/**
 * 일시정지 버튼과 설명
 *
 * 세로는 버튼 오른쪽으로 곧게 나간 화살표 옆에 버튼 높이 가운데로 둔다.
 * 가로는 오른쪽에 내비게이션 막대가 있어 버튼 위로 올라가 오른쪽으로 꺾인다.
 */
function PauseCallout({ callout }: { callout: SessionHelpTextKey }) {
  const { t } = useTranslation("study-session");
  // 버튼이 화면 아래 끝에 붙어 있어서 세 줄 이상을 버튼 높이 가운데에 맞추면 아랫줄이 화면 끝에 닿으므로 버튼 아래 끝에 맞춘다.
  const tall = t(callout).split("\n").length > 2;
  return (
    <div className={cn("absolute inset-0 flex items-end", SESSION_LAYER_INSET)}>
      <FakePauseButton>
        <span aria-hidden className={cn(RING, "rounded-full")} />
        <Arrow
          viewBox="0 0 22 8"
          body="M0 4H20"
          head="M17 0.5L21 4L17 7.5"
          className="absolute top-1/2 left-[calc(100%+8px)] h-2 w-5.5 -translate-y-1/2 landscape-compact:hidden"
        />
        <Arrow
          viewBox="0 0 58 26"
          body="M1 25C1 10 6 4 18 4H53"
          head="M49 0L54 4L49 8"
          className="absolute bottom-[calc(100%+8px)] left-[calc(50%-1px)] hidden h-6.5 w-14.5 overflow-visible landscape-compact:block"
        />
        <CalloutText
          callout={callout}
          className={cn(
            "absolute left-[calc(100%+42px)] w-max whitespace-pre landscape-compact:top-auto landscape-compact:bottom-[calc(100%+8px)] landscape-compact:left-[calc(100%+28px)] landscape-compact:translate-y-0",
            tall ? "bottom-0" : "top-1/2 -translate-y-1/2",
          )}
        />
      </FakePauseButton>
    </div>
  );
}

/** 더보기 버튼과 설명. 설명은 강조 없이 17/24 흰 글자로 줄여 정중앙 제목보다 눈에 덜 띄게 한다. */
function MoreCallout({ callout }: { callout: SessionHelpTextKey }) {
  const { t } = useTranslation("study-session");
  // 버튼이 화면 위 끝에 붙어 있어서 세 줄 이상을 버튼 높이 가운데에 맞추면 윗줄이 화면 밖으로 밀리므로 버튼 위 끝에 맞춘다.
  const tall = t(callout).split("\n").length > 2;
  return (
    <div className={cn(SOLO_MORE_POSITION, "flex size-11 items-center justify-center")}>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full bg-(--session-bar-glass-bg) shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]"
      >
        <img src={moreIcon} alt="" className="h-1 w-4.5" />
      </span>
      {/* 보이는 원(32px) 둘레 5px. 누르는 영역(44px)보다 사방 1px 안쪽이다. */}
      <span aria-hidden className={cn(RING, "inset-px rounded-full")} />
      {/* 설명을 버튼과 같은 높이에 두고 테두리 왼쪽에서 곧게 가리킨다. */}
      <Arrow
        viewBox="0 0 20 8"
        body="M20 4H2"
        head="M5 0.5L1 4L5 7.5"
        className="absolute top-1/2 right-[calc(100%+2px)] h-2 w-4 -translate-y-1/2"
      />
      <CalloutText
        callout={callout}
        className={cn(
          "absolute right-[calc(100%+23px)] text-right text-[17px] leading-6 whitespace-pre text-primary-foreground",
          tall ? "top-0" : "top-1/2 -translate-y-1/2",
        )}
      />
    </div>
  );
}

/**
 * 이동 막대의 바닥 기준선
 *
 * 하단 여백 + 일시정지 버튼 높이 + 버튼 위 68px다. 세로는 크기 단계마다 여백과 버튼 높이가 달라서 같이 바꾼다.
 * 가로는 버튼과 나란히 있어서 바닥에서 40px 위에 둔다.
 */
const NAV_BAR_BOTTOM = [
  "bottom-[calc(env(safe-area-inset-bottom)+136px)]",
  "regular:bottom-[calc(env(safe-area-inset-bottom)+164px)]",
  "short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+183px)]",
  "landscape-compact:bottom-[calc(env(safe-area-inset-bottom)+40px)]",
].join(" ");

/** 이동 막대 버튼(16px Bold). 누르는 영역은 44px 이상이다. */
const NAV_BUTTON =
  "flex min-h-11 min-w-11 items-center justify-center gap-1 text-base leading-6 font-bold outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary-foreground/70";

/**
 * 세션 도움말(5단계)
 *
 * 1~3단계는 심플 모드 화면을 실제 요소로 다시 그리고, 4~5단계는 공부하는 사람 사진 위에 그 단계의 버튼만 실제 자리에 다시 그린다.
 * 단계 목록과 문구는 `SESSION_HELP_STEPS`가 정한다.
 * 실제 상태 필과 실제 버튼을 쓰지 않는 이유는 라이브 리전과 앱 glass 버튼 등록이 따라오기 때문이다.
 * 앱 glass 버튼은 떠 있는 동안 호출부가 faded로 감춰서 여기 그린 가짜 요소만 보인다.
 *
 * 아래 가운데 이동 막대나 덮개 탭으로 다음 단계로 가고, 마지막 단계는 정중앙 `순공 시작하기`로만 닫는다.
 * 마지막 단계의 덮개 탭은 아무 일도 하지 않는다. 덮개를 잘못 눌러 바로 세션으로 넘어가지 않게 한다.
 * 키보드 사용자를 위해 Escape는 바로 닫는다.
 * 끝까지 본 것(`onComplete`)과 중간에 닫은 것(`onDismiss`)을 나눠 알린다. 호출부는 끝까지 본 계정에만 다시 띄우지 않는다.
 * `onLater`를 넘기면 마지막 단계의 `순공 시작하기` 아래에 `나중에 시작할게요`를 둔다. 세션 중에 메뉴로 다시 볼 때는 넘기지 않는다.
 *
 * `aria-modal`을 붙이지 않는다. 붙이면 `nativeModalOverlay`가 모달로 읽어 glass 층 전체를 숨긴다.
 * 덮개 뒤 실제 버튼은 호출부가 `inert`로 막는다. 모달이 아니라 낭독기가 뜬 것을 모르므로 뜰 때와 단계를 넘길 때 루트에 초점을 두고,
 * 닫히면 열기 전 초점(더보기 버튼 등)으로 돌려준다.
 */
export function SessionHelpScreen({
  onComplete,
  onLater,
  onDismiss,
  returnFocus = null,
  step: controlledStep,
  onStepChange,
}: {
  /** 마지막 단계에서 `순공 시작하기`로 끝까지 봤다. */
  onComplete: () => void;
  /** 마지막 단계에서 `나중에 시작할게요`를 눌렀다. */
  onLater?: () => void;
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
  const { t } = useTranslation("study-session");
  const [ownStep, setOwnStep] = useState(0);
  const stepIndex = controlledStep ?? ownStep;
  const setStepIndex = onStepChange ?? setOwnStep;
  const step = SESSION_HELP_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
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

  const goNext = () => {
    if (!isLast) {
      setStepIndex(stepIndex + 1);
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={t("help.dialog")}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onDismiss();
        }
      }}
      className="fixed inset-0 z-40 overflow-hidden bg-background outline-none animate-[coach-fade-in_200ms_ease-out] motion-reduce:animate-none"
    >
      {step.background === "simple" ? (
        <SimpleModeBackdrop step={step} />
      ) : (
        // 세로 화면 전체에 cover하면 사진(3:4)을 크게 키워 사람 윤곽이 잘린다. 화면 높이 80% 상자에 담아 상반신과 책상이 보이게 하고,
        // 위아래 남는 띠는 바탕색으로 둔다. 가로는 상자가 낮아 전체 cover를 유지한다.
        <img
          src={helpPhoto}
          alt=""
          aria-hidden
          className="absolute inset-x-0 top-[10%] h-4/5 w-full object-cover landscape-compact:inset-y-0 landscape-compact:h-full"
        />
      )}
      {/* 덮개 아무 데나 누르면 다음 단계로 간다. 낭독기와 Tab에는 이동 막대만 남긴다.
          심플 모드 단계는 화면 자체가 설명이라 덮개를 칠하지 않는다. */}
      <button
        type="button"
        aria-label={t("help.nextOverlay")}
        aria-hidden
        tabIndex={-1}
        onClick={goNext}
        className={cn(
          "absolute inset-0 cursor-default outline-none",
          step.background === "photo" && "bg-(--coach-dim)",
        )}
      />

      {/* 아래부터는 누름을 받지 않아 탭이 덮개로 내려간다. 끝내기 버튼만 스스로 누름을 받는다. */}
      <div className="pointer-events-none absolute inset-0">
        {callouts.side && <SideCallout callout={callouts.side} />}
        {callouts.pause && <PauseCallout callout={callouts.pause} />}
        {callouts.more && <MoreCallout callout={callouts.more} />}
        {step.center && (
          // 가로는 세로 폭이 좁아 버튼이 하나 늘면 이동 막대와 닿으므로 묶음을 위로 올린다.
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center px-6",
              onLater !== undefined && "landscape-compact:pb-14",
            )}
          >
            <p className="text-center text-[26px] leading-8.5 font-bold break-keep whitespace-pre-line text-primary-foreground">
              <HelpText textKey={step.center} />
            </p>
            {step.cta === true && (
              <button
                type="button"
                onClick={onComplete}
                className="pointer-events-auto mt-6 h-13 rounded-full bg-primary px-8 text-base leading-6 font-bold text-primary-foreground transition-[scale,opacity] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70 active:scale-[0.97] active:opacity-85 motion-reduce:active:scale-100"
              >
                {t("help.finishCta")}
              </button>
            )}
            {step.cta === true && onLater !== undefined && (
              <button
                type="button"
                onClick={onLater}
                className="pointer-events-auto mt-2 min-h-11 px-4 text-sm leading-5 font-medium text-primary-foreground/80 underline underline-offset-4 outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
              >
                {t("help.finishLater")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 이동 막대. 세로는 일시정지 버튼 위 68px(버튼 높이와 하단 여백은 실제 세션 레이어와 같다), 가로는 바닥 40px 위 가운데에 둔다.
          안전 영역을 더해서 홈 인디케이터가 있는 기기에서도 버튼과의 간격이 같다.
          1단계 이전은 자리를 지키되 누를 수 없고, 마지막 단계에는 다음이 없다. 화살표 기호는 낭독기에서 뺀다.
          left-1/2로 두면 폭이 화면 절반으로 묶여 긴 언어에서 글자가 줄바꿈되므로 w-max로 내용 폭을 쓴다. */}
      <div
        className={cn(
          "absolute left-1/2 flex h-12 w-max -translate-x-1/2 items-center gap-5 rounded-full border border-primary-foreground/15 bg-primary-foreground/12 px-5 backdrop-blur-md",
          NAV_BAR_BOTTOM,
        )}
      >
        <button
          type="button"
          disabled={isFirst}
          aria-disabled={isFirst}
          onClick={() => setStepIndex(stepIndex - 1)}
          className={cn(
            NAV_BUTTON,
            "text-primary-foreground/70 disabled:text-primary-foreground/30",
          )}
        >
          <span aria-hidden>‹</span>
          {t("help.prev")}
        </button>
        <span className="text-sm leading-5 font-medium text-primary-foreground/70 tabular-nums">
          {stepIndex + 1}/{SESSION_HELP_STEPS.length}
        </span>
        {!isLast && (
          <button
            type="button"
            onClick={goNext}
            className={cn(NAV_BUTTON, "text-primary-foreground")}
          >
            {t("help.next")}
            <span aria-hidden>›</span>
          </button>
        )}
      </div>
    </div>
  );
}
