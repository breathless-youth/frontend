import type { Ref, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image, LogOut, Music, Pause } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import handTap from "@/assets/guide/hand-tap.svg";
import helpCamera from "@/assets/guide/session-help-camera.jpg";
import moreIcon from "@/assets/icons/session-more.svg";
import { TimerIcon } from "@/features/multi-timer/icons";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { HelpMascot } from "@/features/study-session/components/HelpMascot";
import {
  CONTROL_ICON_SIZE,
  ExpandGlyph,
} from "@/features/study-session/components/SessionControlButtons";
import { SOLO_MORE_POSITION } from "@/features/study-session/components/SessionMoreMenu";
import {
  SESSION_SIDE_GAP,
  SESSION_SIDE_POSITION,
} from "@/features/study-session/components/SessionSideActions";
import { SessionStatusLine } from "@/features/study-session/components/SessionStatusLine";
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { SpotlightDim, type SpotlightHole } from "@/features/study-session/components/SpotlightDim";
import { SubjectLabel } from "@/features/study-session/components/SubjectLabel";
import type { SessionHelpSpot, SessionHelpStep } from "@/features/study-session/sessionGuide";
import { SESSION_HELP_STEPS } from "@/features/study-session/sessionGuide";
import { PIP_ANCHOR, SESSION_LAYER_INSET } from "@/features/study-session/sessionLayout";
import { sessionGlowStyle } from "@/features/study-session/sessionTheme";
import { WallpaperScrim } from "@/features/timer-background/WallpaperScrim";
import { SIMPLE_BACKGROUND_COLOR } from "@/features/timer-background/timerBackground";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

/**
 * 도움말은 세로 배치만 있어서 세션 자리 상수에서 가로 조각을 걷어 낸다.
 * 앱은 도움말이 떠 있는 동안 세로로 고정하고, 가로 브라우저에서도 세로 배치를 그대로 그린다.
 */
function portraitOnly(classes: string): string {
  return classes
    .split(" ")
    .filter((name) => !name.startsWith("landscape-compact:"))
    .join(" ");
}

/** 세션의 작은 창과 같은 세로 크기 */
const PIP_PORTRAIT_SIZE = "h-36 w-27 regular:h-48 regular:w-36";

/** 가짜 순공 숫자 시작값(01:24:08)과 총 공부(01:45:12), 예시 과목 시간(01:10:00) */
const FOCUS_START_SEC = 5048;
const STUDY_START_SEC = 6312;
const SUBJECT_FOCUS_SEC = 4200;

/** 덮개 진하기. 심플 화면도 같은 값이라야 시계가 일반 화면 단계와 같은 밝기로 가라앉는다. */
const HELP_DIM = 0.6;

/** 말풍선 아래 끝은 상태 줄 글자 위 끝에서 이만큼 위에 둔다. */
const BUBBLE_GAP_PX = 48;

/** 측정 중에서 심플 모드로 넘어갈 때 화면을 누르는 손을 보이는 시간 */
const TAP_MS = 700;

/** 강조 구멍 여백. 상태 줄은 점과 문구를 감싸는 알약이고 작은 창·더보기는 누르는 영역 그대로다. */
const HOLE_SHAPE: Record<SessionHelpSpot, Omit<SpotlightHole, "ref">> = {
  status: { padX: 14, padY: 8, radius: 9999 },
  clock: { padX: 8, padY: 10, radius: 16 },
  more: { padX: 0, padY: 0, radius: 9999 },
  pip: { padX: 0, padY: 0, radius: 16 },
};

/**
 * 가짜 순공 숫자
 *
 * 실제 타이머 컴포넌트로 그려서 크기·발광이 실제와 같다.
 * 단계마다 다시 마운트되어 시작값에서 다시 센다.
 * 모션 줄이기를 켜면 숫자를 멈춘다.
 */
function FakeFocusTimer({ step, glow }: { step: SessionHelpStep; glow: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!step.ticking || prefersReducedMotion()) {
      return;
    }
    const id = window.setInterval(() => setElapsed((sec) => sec + 1), 1000);
    return () => window.clearInterval(id);
  }, [step.ticking]);
  return (
    <SessionTimer
      focusSec={FOCUS_START_SEC + elapsed}
      studySec={STUDY_START_SEC + elapsed}
      state={step.state}
      glow={glow}
    />
  );
}

/** 하단 일시정지·나가기 자리의 가짜 버튼 */
function FakeBottomButtons({ simple }: { simple: boolean }) {
  return (
    <div className="mt-2 flex w-full justify-between regular:mt-2.5 short-side-lg:mt-3">
      <span className={controlButtonVariants({ size: "primary" })}>
        <Pause fill="currentColor" className={CONTROL_ICON_SIZE} />
      </span>
      {!simple && (
        <span className={controlButtonVariants({ variant: "exit", size: "primary" })}>
          <LogOut className={CONTROL_ICON_SIZE} />
        </span>
      )}
    </div>
  );
}

/**
 * 세션 화면의 시계 쪽 층
 *
 * 실제 세션 레이어와 같은 여백·스페이서로 상태 줄, 과목 줄, 숫자, 하단 버튼을 그려서 강조 자리가 실제 자리와 같다.
 * 일반 모드는 시계를 하단 버튼 바로 위에, 심플 모드는 위아래 가운데에 둔다.
 */
function FakeClockLayer({
  step,
  simple,
  statusRef,
  clockRef,
}: {
  step: SessionHelpStep;
  simple: boolean;
  statusRef?: Ref<HTMLDivElement>;
  clockRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation("study-session");
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center",
        portraitOnly(SESSION_LAYER_INSET),
      )}
    >
      <div className="h-9 shrink-0 regular:h-9.75 short-side-lg:h-12" />
      <div className="grow" />
      <div ref={clockRef} className="flex flex-col items-center">
        {!simple && (
          // 점은 문구 왼쪽 바깥에 붙어 있어서 점 폭만큼 왼쪽으로 넓힌 상자를 재야 구멍이 점까지 감싼다.
          <div ref={statusRef} className="-mb-1.25 -ml-3.5 pl-3.5">
            <SessionStatusLine
              live={false}
              state={step.state}
              label={t(step.state === "distract" ? "status.away" : "status.focus")}
            />
          </div>
        )}
        <SubjectLabel
          name={t("help.sampleSubject")}
          focusSec={SUBJECT_FOCUS_SEC}
          className={cn("-mb-3.5", simple && "[&_span]:text-white")}
        />
        <FakeFocusTimer key={step.id} step={step} glow={simple} />
      </div>
      <div className={simple ? "grow" : "grow-0"} />
      <FakeBottomButtons simple={simple} />
    </div>
  );
}

/**
 * 일반 모드 세션 화면
 *
 * 공간 배경 위에 작은 카메라 창, 더보기, 세로 열, 시계 층을 실제 자리에 다시 그린다.
 * 카메라 창 안에는 공부하는 사람 예시 사진을 둔다.
 */
function FakeNormalScreen({
  step,
  statusRef,
  clockRef,
  moreRef,
  pipRef,
}: {
  step: SessionHelpStep;
  statusRef: Ref<HTMLDivElement>;
  clockRef: Ref<HTMLDivElement>;
  moreRef: Ref<HTMLDivElement>;
  pipRef: Ref<HTMLDivElement>;
}) {
  return (
    <>
      <div className="absolute inset-0" style={{ backgroundColor: SIMPLE_BACKGROUND_COLOR }} />
      <WallpaperScrim simple={false} />
      <div
        ref={pipRef}
        className={cn(
          portraitOnly(PIP_ANCHOR),
          PIP_PORTRAIT_SIZE,
          "overflow-hidden rounded-lg bg-muted",
        )}
      >
        <img src={helpCamera} alt="" className="absolute inset-0 size-full object-cover" />
        {/* 안쪽 그림자는 사진에 가려지므로 테두리는 사진 위 층에 그린다. */}
        <span className="absolute inset-0 rounded-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]" />
        <span className="absolute top-0 left-0 flex size-11 items-center justify-center">
          <span className="flex size-7 items-center justify-center rounded-full bg-(--session-pill-bg) backdrop-blur-[10px]">
            <ExpandGlyph className="size-4 text-white" />
          </span>
        </span>
      </div>
      <div
        ref={moreRef}
        className={cn(portraitOnly(SOLO_MORE_POSITION), "flex size-11 items-center justify-center")}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-(--session-bar-glass-bg) shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px]">
          <img src={moreIcon} alt="" className="h-1 w-4.5" />
        </span>
      </div>
      <div className={cn(portraitOnly(SESSION_SIDE_POSITION), "flex flex-col", SESSION_SIDE_GAP)}>
        <span className={controlButtonVariants()}>
          <Image className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
        </span>
        <span className={controlButtonVariants()}>
          <Music className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
        </span>
        <span className={controlButtonVariants()}>
          <TimerIcon className="size-7 regular:size-8.25 short-side-lg:size-10.25" />
        </span>
      </div>
      <FakeClockLayer step={step} simple={false} statusRef={statusRef} clockRef={clockRef} />
    </>
  );
}

/**
 * 화면을 톡 누르는 손과 퍼지는 원
 *
 * 손 SVG는 currentColor로 그려져 있어 `<img>`로는 색이 들어가지 않으므로 마스크로 찍고 글자색 토큰으로 칠한다.
 */
function TapMotion() {
  // Vite가 작은 SVG를 data URL로 넣어서 공백이 섞이므로 따옴표로 감싼다.
  const mask = `url("${handTap}") center / contain no-repeat`;
  return (
    <div className="absolute top-[calc(50%-27px)] left-1/2 size-18 -translate-1/2 animate-[help-tap_700ms_ease-out_both] motion-reduce:animate-none">
      <span className="absolute inset-0 rounded-full bg-primary-foreground/15" />
      <span className="absolute inset-3.75 rounded-full bg-primary-foreground/25" />
      <span
        data-testid="tap-hand"
        style={{ mask, WebkitMask: mask }}
        className="absolute top-7.5 left-5 block h-13 w-9.5 bg-primary-foreground"
      />
    </div>
  );
}

/** 말풍선 아래 줄 버튼 글자(13px). 보이는 높이는 36px이고 누르는 영역은 44px다. */
const BUBBLE_BUTTON =
  "-my-1 flex min-h-11 items-center text-[13px] leading-4.5 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary";

/**
 * 세션 도움말(5단계)
 *
 * 일반 모드 세션 화면을 다시 그리고 덮개로 어둡게 한 뒤, 단계마다 강조할 자리만 구멍을 뚫어 원래 밝기로 보인다.
 * 말풍선과 마스코트는 상태 줄 위에 아래 끝을 맞춰 두어 글이 길어지면 위로 자란다.
 * 실제 상태 줄과 실제 버튼을 쓰지 않는 이유는 라이브 리전과 앱 glass 버튼 등록이 따라오기 때문이다.
 * 앱 glass 버튼은 떠 있는 동안 호출부가 faded로 감춰서 여기 그린 가짜 요소만 보인다.
 *
 * 말풍선의 다음이나 덮개 탭으로 다음 단계로 가고, 마지막 단계는 `순공 시작하기`로만 닫는다.
 * 마지막 단계의 덮개 탭은 아무 일도 하지 않는다. 덮개를 잘못 눌러 바로 세션으로 넘어가지 않게 한다.
 * 키보드 사용자를 위해 Escape는 바로 닫는다.
 * 끝까지 본 것(`onComplete`)과 중간에 닫은 것(`onDismiss`)을 나눠 알린다. 호출부는 끝까지 본 계정에만 다시 띄우지 않는다.
 * `onLater`를 넘기면 마지막 단계 말풍선 오른쪽 위에 `나중에 하기`를 둔다. 세션 중에 메뉴로 다시 볼 때는 넘기지 않는다.
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
  /** 마지막 단계에서 `나중에 하기`를 눌렀다. */
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
  const total = SESSION_HELP_STEPS.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;
  const [tapping, setTapping] = useState(false);
  const shownScreen = tapping ? "normal" : step.screen;

  const rootRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!tapping) return;
    const id = window.setTimeout(() => setTapping(false), TAP_MS);
    return () => window.clearTimeout(id);
  }, [tapping]);

  // 상태 줄은 늘 같은 자리에 마운트되어 있어 처음과 창 크기가 바뀔 때만 잰다.
  const [bubbleBottom, setBubbleBottom] = useState(BUBBLE_GAP_PX);
  useLayoutEffect(() => {
    const measure = () => {
      const frame = rootRef.current?.getBoundingClientRect();
      const status = statusRef.current?.getBoundingClientRect();
      if (frame && status) setBubbleBottom(frame.bottom - status.top + BUBBLE_GAP_PX);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // 심플 화면은 화면 가운데 시계를 가리지 않도록 말풍선 아래 끝을 위에서 3/4 높이에 맞춘다.
  const bubbleLow = step.screen === "simple";

  const goTo = (index: number) => {
    // 일반 화면에서 심플 화면으로 넘어갈 때만 화면을 누르는 손을 보인 뒤 바꾼다.
    const next = SESSION_HELP_STEPS[index];
    setTapping(
      index === stepIndex + 1 &&
        step.screen === "normal" &&
        next.screen === "simple" &&
        !prefersReducedMotion(),
    );
    setStepIndex(index);
  };
  const goNext = () => {
    if (!isLast) goTo(stepIndex + 1);
  };

  const spotRefs: Record<SessionHelpSpot, RefObject<HTMLDivElement | null>> = {
    status: statusRef,
    clock: clockRef,
    more: moreRef,
    pip: pipRef,
  };
  // 누르는 손이 보이는 동안은 아직 일반 화면이라 다음 단계의 강조 자리를 비워 둔다.
  const holes = tapping
    ? []
    : step.spots.map((spot) => ({ ref: spotRefs[spot], ...HOLE_SHAPE[spot] }));

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
      data-testid="help-screen"
      data-screen={shownScreen}
      style={sessionGlowStyle(step.state === "distract" ? "DISTRACTION" : "FOCUS")}
      className="fixed inset-0 z-40 overflow-hidden bg-background outline-none animate-[coach-fade-in_200ms_ease-out] motion-reduce:animate-none"
    >
      <div aria-hidden="true" className="absolute inset-0">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            shownScreen === "simple" && "opacity-0",
          )}
        >
          <FakeNormalScreen
            step={step}
            statusRef={statusRef}
            clockRef={clockRef}
            moreRef={moreRef}
            pipRef={pipRef}
          />
        </div>
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none",
            shownScreen === "normal" && "opacity-0",
          )}
        >
          <SimpleModeSurface glowKey={step.id} />
          <FakeClockLayer step={step} simple />
        </div>
      </div>

      {/* 심플 화면은 어두운 바탕에 시계만 있어 덮개 상자 없이 과목 줄 글자를 밝혀 강조한다. */}
      {shownScreen !== "simple" && (
        <SpotlightDim key={`${step.id}-${tapping}`} holes={holes} opacity={HELP_DIM} />
      )}

      <div className="pointer-events-none absolute inset-0">
        {tapping && <TapMotion />}

        {isLast && (
          <>
            <div className={cn(portraitOnly(SOLO_MORE_POSITION), "size-11")}>
              <p className="absolute top-10 right-[calc(100%+12px)] w-max text-right text-[13px] leading-4.5 font-medium whitespace-pre-line text-white">
                {t("help.finishMore")}
              </p>
            </div>
            <div className={cn(portraitOnly(PIP_ANCHOR), PIP_PORTRAIT_SIZE)}>
              <p className="absolute bottom-0 left-[calc(100%+8px)] w-max text-[13px] leading-4.5 font-medium whitespace-pre-line text-white">
                {t("help.finishPip")}
              </p>
            </div>
          </>
        )}

        {/* 넓은 창에서도 말풍선은 폰 폭(마스코트 포함 370px)을 넘지 않고 가운데에 둔다. */}
        <div
          className={cn(
            "absolute inset-x-4 mx-auto flex max-w-92.5 items-end gap-2",
            bubbleLow && "top-3/4 -translate-y-full",
          )}
          style={bubbleLow ? undefined : { bottom: bubbleBottom }}
        >
          <HelpMascot pose={step.mascot} />
          <div className="pointer-events-auto relative flex min-w-0 flex-1 flex-col gap-1.5 rounded-md bg-primary-foreground px-4 pt-3.5 pb-3">
            <p className="text-base leading-5.5 font-bold break-keep whitespace-pre-line text-background">
              <Trans
                t={t}
                i18nKey={step.title}
                components={{ hl: <span className="text-primary" /> }}
              />
            </p>
            {step.body !== undefined && (
              <p className="text-sm leading-5 break-keep text-text-tertiary">{t(step.body)}</p>
            )}
            <div className="flex items-center gap-1 pt-1.5">
              <span className="text-xs leading-4 font-medium text-text-tertiary tabular-nums">
                {t("help.stepCount", { current: stepIndex + 1, total })}
              </span>
              <span className="grow" />
              <button
                type="button"
                disabled={isFirst}
                onClick={() => goTo(stepIndex - 1)}
                className={cn(
                  BUBBLE_BUTTON,
                  "px-2.5 font-medium text-text-tertiary disabled:opacity-40",
                )}
              >
                {t("help.prev")}
              </button>
              <button
                type="button"
                onClick={isLast ? onComplete : goNext}
                className={cn(BUBBLE_BUTTON, "group")}
              >
                <span className="rounded-sm bg-primary px-4 py-2.25 font-bold text-primary-foreground transition-[scale,opacity] duration-150 ease-out group-active:scale-[0.97] group-active:opacity-85 motion-reduce:transition-none motion-reduce:group-active:scale-100">
                  {t(isLast ? "help.finishCta" : "help.next")}
                </span>
              </button>
            </div>
            {isLast && onLater !== undefined && (
              <button
                type="button"
                onClick={onLater}
                className={cn(
                  BUBBLE_BUTTON,
                  "absolute top-0.75 right-1.5 my-0 px-2.5 font-medium text-text-tertiary underline underline-offset-2",
                )}
              >
                {t("help.finishLater")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
