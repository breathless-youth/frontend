import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import handTap from "@/assets/guide/hand-tap.svg";
import helpPhoto from "@/assets/guide/session-help-photo.jpg";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { SessionClock } from "@/features/study-session/components/SessionClock";
import {
  BAR_ICON_SIZE,
  ExitGlyph,
  PauseGlyph,
  SESSION_BAR,
} from "@/features/study-session/components/SessionControlButtons";
import { AmbientLinesIcon } from "@/features/ambient-sound/components/AmbientSoundButton";
import { SESSION_PILL_BUTTON } from "@/features/study-session/components/SessionMoreMenu";
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
/** 가짜 버튼. 바탕 클래스의 pointer-events-auto를 덮어 덮개 탭이 그대로 다음 단계로 간다. */
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

/** 가짜 공부 시간 시작값(01:24:08)과 가짜 순공 시작값(01:10:00) */
const STUDY_START_SEC = 5048;
const FOCUS_START_SEC = 4200;

/**
 * 가짜 시간 묶음
 *
 * 실제 세션의 시간 묶음 컴포넌트로 그려서 크기와 자리가 실제와 같다.
 * 공부 시간은 비집중에도 흐르고, 순공은 측정 중일 때만 오른다.
 * 단계마다 다시 마운트되어 시작값에서 다시 센다. 모션 줄이기를 켜면 숫자를 멈춘다.
 * 낭독기에는 설명 문구만 남기고 누를 수 없게 막는다.
 */
function FakeClock({
  step,
  callouts,
}: {
  step: SessionHelpStep;
  callouts: { caption?: ReactNode; card?: ReactNode };
}) {
  const { t } = useTranslation("study-session");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }
    const id = window.setInterval(() => setElapsed((sec) => sec + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const distract = step.state === "distract";
  const studySec = STUDY_START_SEC + elapsed;
  return (
    <SessionClock
      studySec={studySec}
      focusSec={FOCUS_START_SEC + (step.ticking === true ? elapsed : 0)}
      todayStudySec={studySec}
      state={distract ? "distract" : "focus"}
      statusLabel={t("status.away")}
      simple
      // 순공시간 설명 단계만 카드를 펼쳐 멈추고 흐르는 순공을 보인다.
      infoOpen={callouts.card !== undefined}
      onToggleInfo={() => {}}
      callouts={callouts}
      fake
    />
  );
}

/**
 * 상태 문구 설명
 *
 * 세로는 문구 위로 둥글게 올라가는 화살표 위에 설명을 화면 가운데로 둔다.
 * 가로는 위아래 자리가 없어 문구 오른쪽에 짧은 화살표와 설명을 둔다.
 */
function CaptionCallout({ callout }: { callout: SessionHelpTextKey }) {
  const { t } = useTranslation("study-session");
  const tall = t(callout).split("\n").length > 2;
  return (
    <>
      <span aria-hidden className={cn(RING, "rounded-full")} />
      <Arrow
        viewBox="0 0 24 44"
        body="M23 1C10 1 4 4 4 18V40"
        head="M0 35L4 40L8 35"
        className="absolute right-[calc(100%+6px)] bottom-[calc(50%+6px)] h-11 w-6 -scale-y-100 landscape-compact:hidden"
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
          "absolute bottom-[calc(100%+34px)] left-1/2 -translate-x-1/2 whitespace-pre landscape-compact:bottom-auto landscape-compact:left-[calc(100%+36px)] landscape-compact:translate-x-0",
          // 가로에서 세 줄 이상이면 아래 숫자를 덮지 않게 문구 아래 끝에 맞춰 위로 쌓는다.
          tall
            ? "landscape-compact:bottom-0"
            : "landscape-compact:top-1/2 landscape-compact:-translate-y-1/2",
        )}
      />
    </>
  );
}

/**
 * 순공시간 카드 설명
 *
 * 세로는 카드 아래로 곧게 내려가는 화살표 밑에 가운데 정렬로 둔다.
 * 가로는 카드 왼쪽에 오른쪽 정렬로 두고 화살표가 카드를 향한다.
 */
function CardCallout({ callout }: { callout: SessionHelpTextKey }) {
  return (
    <>
      <span aria-hidden className={cn(RING, "rounded-2xl")} />
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
          // 카드 왼쪽 자리가 좁아 가로에서만 문구의 줄바꿈을 살리고 세로에서는 공백으로 접는다.
          className="mt-2 text-center text-balance whitespace-normal landscape-compact:mt-0 landscape-compact:mr-3 landscape-compact:text-right landscape-compact:whitespace-pre-line"
        />
      </div>
    </>
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
    <div className="absolute top-full left-1/2 mt-12 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-3 landscape-compact:top-1/2 landscape-compact:right-full landscape-compact:left-auto landscape-compact:mt-0 landscape-compact:mr-12 landscape-compact:translate-x-0 landscape-compact:-translate-y-1/2">
      <CalloutText
        callout={callout}
        className="text-center text-balance whitespace-normal landscape-compact:whitespace-pre-line"
      />
      <TapHandIcon />
    </div>
  );
}

/** 가짜 하단 바. 일시정지와 종료를 실제와 같은 모양으로 그린다. */
export function FakeBar({ children }: { children?: ReactNode }) {
  return (
    <div className={cn(SESSION_BAR, "relative")}>
      <span className={cn(controlButtonVariants({ variant: "pause", size: "bar" }), FAKE_BUTTON)}>
        <PauseGlyph aria-hidden className={BAR_ICON_SIZE} />
      </span>
      <span className={cn(controlButtonVariants({ variant: "stop", size: "bar" }), FAKE_BUTTON)}>
        <ExitGlyph aria-hidden className={BAR_ICON_SIZE} />
      </span>
      {children}
    </div>
  );
}

/** 가짜 알약 버튼(배경음·더보기). 타이머 배경 미리보기도 같이 쓴다. */
export function FakePill({ icon }: { icon: "ambient" | "more" }) {
  return (
    <span className={cn(SESSION_PILL_BUTTON, FAKE_BUTTON)}>
      {icon === "ambient" ? (
        <AmbientLinesIcon on={false} />
      ) : (
        <Ellipsis aria-hidden className="size-5" strokeWidth={2} />
      )}
    </span>
  );
}

/**
 * 심플 모드 화면
 *
 * 실제 세션 레이어와 같은 여백·배치로 머리 줄, 시간 묶음, 하단 바를 그려서 설명이 실제 자리를 가리킨다.
 * 상태 색은 실제 세션 상태가 아니라 단계가 정해서, 이 화면 안에서만 발광 색 변수를 덮어쓴다.
 * 탭 설명 단계는 덮개 대신 가짜 요소를 옅게 해서 가운데 문구만 또렷하게 둔다.
 */
function SimpleModeBackdrop({ step }: { step: SessionHelpStep }) {
  const { pill, timer, tap } = step.callouts;
  const dimmed = tap !== undefined && "opacity-40";
  return (
    <div
      style={sessionGlowStyle(step.state === "distract" ? "DISTRACTION" : "FOCUS")}
      className="absolute inset-0"
    >
      <SimpleModeSurface glowKey={step.id} />
      <div className={cn("absolute inset-0 flex flex-col items-center", SESSION_LAYER_INSET)}>
        {/* 머리 줄은 실제 과목 줄 높이(56px)만 비우고 오른쪽 알약만 그린다. 과목 줄은 설명하지 않는다.
            가로는 상태 문구 설명이 오른쪽 위로 뻗어 알약과 겹치므로 알약을 감춘다. */}
        <div
          aria-hidden
          className={cn(
            "flex h-14 w-full items-start justify-end landscape-compact:invisible",
            dimmed,
          )}
        >
          <div className="flex gap-2 pt-1">
            <FakePill icon="ambient" />
            <FakePill icon="more" />
          </div>
        </div>
        {/* 실제 심플 모드처럼 머리 줄과 하단 바 사이 4:9 지점에 시간 묶음을 둔다. 가로는 화면 가운데다. */}
        <div className="grow-4 landscape-compact:h-0 landscape-compact:grow-0" />
        <div className="relative landscape-compact:absolute landscape-compact:top-1/2 landscape-compact:left-1/2 landscape-compact:-translate-x-1/2 landscape-compact:-translate-y-1/2">
          <div className={cn(dimmed)}>
            <FakeClock
              key={step.id}
              step={step}
              callouts={{
                caption: pill && <CaptionCallout callout={pill} />,
                card: timer && <CardCallout callout={timer} />,
              }}
            />
          </div>
          {tap && <TapCallout callout={tap} />}
        </div>
        <div className="grow-9" />
        <div aria-hidden className={cn(dimmed)}>
          <FakeBar />
        </div>
      </div>
    </div>
  );
}

/**
 * 사진 단계의 머리 줄과 하단 바
 *
 * 실제 세션 레이어와 같은 여백으로 그 단계가 설명하는 버튼만 다시 그린다.
 * 배경음·더보기 묶음 설명은 아래로, 더보기 설명은 왼쪽으로, 하단 바 설명은 세로에서 위로, 가로에서 왼쪽으로 둔다.
 * 가로의 오른쪽 아래는 이동 막대 자리다.
 */
function PhotoChrome({ step }: { step: SessionHelpStep }) {
  const { t } = useTranslation("study-session");
  const { side, pause, more } = step.callouts;
  const tallMore = more !== undefined && t(more).split("\n").length > 2;
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center", SESSION_LAYER_INSET)}>
      <div aria-hidden className="flex w-full justify-end">
        {side && (
          <div className="relative flex gap-2">
            <FakePill icon="ambient" />
            <FakePill icon="more" />
            <span className={cn(RING, "rounded-full")} />
            <Arrow
              viewBox="0 0 24 24"
              body="M20 4Q4 6 2 20"
              head="M-0.5 16L2 20L5 16.5"
              className="absolute top-[calc(100%+6px)] right-12 h-6 w-6 overflow-visible"
            />
            <CalloutText
              callout={side}
              className="absolute top-[calc(100%+36px)] right-0 text-right whitespace-pre"
            />
          </div>
        )}
        {more && (
          <div className="relative">
            <FakePill icon="more" />
            <span className={cn(RING, "rounded-full")} />
            {/* 설명을 버튼과 같은 높이에 두고 테두리 왼쪽에서 곧게 가리킨다. 강조 없이 17/24 흰 글자로 줄여 정중앙 제목보다 덜 띄게 한다. */}
            <Arrow
              viewBox="0 0 20 8"
              body="M20 4H2"
              head="M5 0.5L1 4L5 7.5"
              className="absolute top-1/2 right-[calc(100%+8px)] h-2 w-4 -translate-y-1/2"
            />
            <CalloutText
              callout={more}
              className={cn(
                "absolute right-[calc(100%+28px)] text-right text-[17px] leading-6 whitespace-pre text-primary-foreground",
                tallMore ? "top-0" : "top-1/2 -translate-y-1/2",
              )}
            />
          </div>
        )}
      </div>
      <div className="grow" />
      {pause && (
        <FakeBar>
          <span aria-hidden className={cn(RING, "rounded-[36px]")} />
          <Arrow
            viewBox="0 0 16 32"
            body="M8 31V3"
            head="M4 7L8 2L12 7"
            className="absolute bottom-[calc(100%+6px)] left-1/2 h-8 w-4 -translate-x-1/2 landscape-compact:hidden"
          />
          <Arrow
            viewBox="0 0 22 8"
            body="M22 4H2"
            head="M5 0.5L1 4L5 7.5"
            className="absolute top-1/2 right-[calc(100%+8px)] hidden h-2 w-5.5 -translate-y-1/2 landscape-compact:block"
          />
          <CalloutText
            callout={pause}
            className="absolute bottom-[calc(100%+44px)] left-1/2 w-max -translate-x-1/2 text-center whitespace-pre landscape-compact:top-1/2 landscape-compact:right-[calc(100%+40px)] landscape-compact:bottom-auto landscape-compact:left-auto landscape-compact:translate-x-0 landscape-compact:-translate-y-1/2 landscape-compact:text-right"
          />
        </FakeBar>
      )}
    </div>
  );
}

/**
 * 이동 막대의 자리
 *
 * 세로는 가운데, 하단 바 위 일시정지 설명보다 위에 둔다: 하단 여백 + 바 높이 + 설명 자리 112px.
 * 가로는 화면 높이가 낮아 가운데 시간 묶음과 겹치므로 오른쪽 아래 구석에 하단 바와 같은 높이로 둔다.
 */
const NAV_BAR_BOTTOM = [
  "bottom-[calc(env(safe-area-inset-bottom)+192px)]",
  "regular:bottom-[calc(env(safe-area-inset-bottom)+212px)]",
  "short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+227px)]",
  "landscape-compact:right-[max(env(safe-area-inset-right),16px)] landscape-compact:bottom-[calc(env(safe-area-inset-bottom)+20px)] landscape-compact:left-auto landscape-compact:translate-x-0",
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
        {step.background === "photo" && <PhotoChrome step={step} />}
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
