import { LockKeyhole } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import handTap from "@/assets/guide/hand-tap.svg";
import exampleUrl from "@/assets/guide/session-help-example.jpg";
import { Switch } from "@/components/ui/switch";
import { HelpMascot } from "@/features/study-session/components/HelpMascot";
import { SessionClock } from "@/features/study-session/components/SessionClock";
import { FakeBar, FakeSessionHeader } from "@/features/study-session/components/SessionFakeChrome";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { readSessionClockView } from "@/features/study-session/sessionClockView";
import { SESSION_HELP_STEPS } from "@/features/study-session/sessionGuide";
import { PIP_ANCHOR, PIP_SIZE, SESSION_LAYER_INSET } from "@/features/study-session/sessionLayout";
import { sessionGlowStyle, sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useSlideFromRect } from "@/features/study-session/useSlideFromRect";
import { useTimelapseSettings } from "@/features/timelapse/useTimelapseSettings";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

/** 가짜 순공(초)의 시작값. 확인 중·구도 장에서는 1초씩 흐르고, 멈춤 장에서는 흐른 값 그대로 멈춘다. */
const DEMO_FOCUS_SEC = 1450;

/**
 * 멈춤 장에서 심플 모드 장으로 넘어갈 때 화면을 누르는 손을 보이는 시간. 손 모션(`help-tap`)을 이 길이로 늘려 재생한다.
 * dev 도움말(700ms)보다 길게 둬서 누르는 모습을 본 뒤에 바뀐다.
 */
const TAP_MS = 1400;

/** 말풍선 문구 키. 제목의 `<hl>` 핵심 단어는 파란 글자로 칠한다. */
const BUBBLE_TEXT = {
  welcome: { title: "help.welcomeTitle", body: "help.welcomeBody" },
  grace: { title: "help.graceTitle", body: "help.graceBody" },
  distract: { title: "help.stopTitle", body: "help.stopBody" },
  simple: { title: "help.simpleTitle", body: "help.simpleBody" },
  ready: { title: "help.readyTitle", body: null },
  start: { title: "help.startTitle", body: null },
} as const;

/** 준비 장에서 구도를 짚으려고 키운 카메라 창. 자리(`PIP_ANCHOR`)는 그대로다. */
const READY_PIP_SIZE =
  "h-60 w-45 regular:h-72 regular:w-54 landscape-compact:h-36 landscape-compact:w-48";

/**
 * 말풍선 자리. 아래 끝을 오른쪽 아래 카메라 창 위 끝보다 12px 위에 둔다.
 * 창 자리(`PIP_ANCHOR`)의 아래 여백 + 창 높이 + 12px이다. 가로는 창이 낮아 화면 가운데 높이에 둔다.
 */
const BUBBLE_ABOVE_PIP = [
  "bottom-[calc(env(safe-area-inset-bottom)+270px)]",
  "regular:bottom-[calc(env(safe-area-inset-bottom)+338px)] short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+353px)]",
  "landscape-compact:top-[46%] landscape-compact:bottom-auto",
].join(" ");
/** 준비 장 말풍선 자리. 키운 창(`READY_PIP_SIZE`)과 그 위 영상 안내 한 줄(28px) 위 12px이다. 가로는 위쪽에 둔다. */
const BUBBLE_ABOVE_READY_PIP = [
  "bottom-[calc(env(safe-area-inset-bottom)+394px)]",
  "regular:bottom-[calc(env(safe-area-inset-bottom)+462px)] short-side-lg:bottom-[calc(env(safe-area-inset-bottom)+477px)]",
  "landscape-compact:top-[calc(env(safe-area-inset-top)+12px)] landscape-compact:bottom-auto",
].join(" ");
/**
 * 심플 모드 장 말풍선 자리. 화면 가운데 시계 묶음 바로 아래 24px에 위 끝을 둔다.
 * 시계 묶음 절반 높이(폰 42px, regular 60px, short-side-lg 72px) + 24px이다. 가로는 낮아서 하단 바 위에 둔다.
 */
const BUBBLE_BELOW_SIMPLE_CLOCK = [
  "top-[calc(50%+66px)] regular:top-[calc(50%+84px)] short-side-lg:top-[calc(50%+96px)]",
  "landscape-compact:top-auto landscape-compact:bottom-[calc(env(safe-area-inset-bottom)+120px)]",
].join(" ");

/** 말풍선 아래 줄 버튼(13px). 보이는 높이는 36px이고 누르는 영역은 44px다. dev 도움말과 같다. */
const BUBBLE_BUTTON =
  "-my-1 flex min-h-11 items-center text-[13px] leading-4.5 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary";
const BUBBLE_PRIMARY =
  "rounded-sm bg-primary px-4 py-2.25 font-bold text-primary-foreground transition-[scale,opacity] duration-150 ease-out group-active:scale-[0.97] group-active:opacity-85 motion-reduce:transition-none motion-reduce:group-active:scale-100";

/** 마지막 장에서 누른 버튼. `start`는 처음 보는 계정, `close`는 메뉴로 다시 본 경우다. */
export interface SessionHelpResult {
  readonly cta: "start" | "close";
  /** 마지막 장의 타임랩스 스위치 값. 메뉴로 연 도움말이거나 아직 설정을 읽지 못했으면 null이다. */
  readonly timelapseEnabled: boolean | null;
}

type HelpTitleKey = (typeof BUBBLE_TEXT)[keyof typeof BUBBLE_TEXT]["title"];

function HelpTitle({ textKey, highlight }: { textKey: HelpTitleKey; highlight: ReactElement }) {
  const { t } = useTranslation("study-session");
  return <Trans t={t} i18nKey={textKey} components={{ hl: highlight }} />;
}

/**
 * 화면을 톡 누르는 손과 퍼지는 원(dev 도움말과 같은 모션)
 *
 * 손 SVG는 currentColor로 그려져 있어 `<img>`로는 색이 들어가지 않으므로 마스크로 찍고 글자색 토큰으로 칠한다.
 */
function TapMotion() {
  // Vite가 작은 SVG를 data URL로 넣어서 공백이 섞이므로 따옴표로 감싼다.
  const mask = `url("${handTap}") center / contain no-repeat`;
  return (
    <div
      aria-hidden
      className="absolute top-[calc(50%-27px)] left-1/2 z-20 size-18 -translate-1/2 animate-[help-tap_1400ms_ease-out_both] motion-reduce:animate-none"
    >
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

/** 카메라 창 위 구도 이름표. 자리는 창 크기 대비 %다. */
function PhotoMark({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn("absolute rounded-lg border-[1.5px] border-dashed border-[#ffd25c]", className)}
    >
      <span className="absolute -top-2.5 left-1 rounded bg-[#ffd25c] px-1 text-[10px] leading-4 font-bold text-neutral-900">
        {label}
      </span>
    </span>
  );
}

/**
 * 세션 도움말(여섯 장)
 *
 * 실제 세션과 같은 배치 상수로 가짜 세션 화면을 그리고 그 위에 마스코트 말풍선을 띄운다. 배치가 바뀌면 상수를 따라 같이 바뀐다.
 * 2장 확인 중(상태 문구가 깜빡이고 순공은 계속 흐름), 3장 멈춤(순공이 멈춤)은 시계와 카메라 창만 덮개 위로 밝게 둔다.
 * 3장에서 넘어갈 때 화면을 누르는 손을 보인 뒤, 실제 세션처럼 시계가 가운데로 미끄러지고 카메라 창이 걷히며 심플 모드로 바뀐다.
 * 5장은 카메라 창을 키워 얼굴·손·공부도구 구도를 짚고 창 위에 영상 안내를 단다. 6장에서 타임랩스를 고르고 시작한다.
 * 마스코트 표정은 dev 도움말처럼 장마다 다르다(`SESSION_HELP_STEPS`).
 *
 * `first`는 처음 보는 계정의 새 세션에서 카운트다운 앞에 뜬다. 6장에 타임랩스 스위치와 `공부 시작하기`가 있다.
 * `menu`는 더보기의 도움말 보기로 세션 중에 다시 연 것이다. 6장에 `닫기`만 있다.
 * 덮개를 눌러도 아무 일도 하지 않는다. 키보드 사용자를 위해 Escape는 어느 장에서든 바로 닫는다(`onDismiss`).
 *
 * `aria-modal`을 붙이지 않는다. 붙이면 `nativeModalOverlay`가 모달로 읽어 glass 층 전체를 숨긴다.
 * 덮개 뒤 실제 버튼은 호출부가 `inert`로 막는다. 뜰 때와 장을 넘길 때 루트에 초점을 두고,
 * 닫히면 열기 전 초점(더보기 버튼 등)으로 돌려준다.
 */
export function SessionHelpScreen({
  mode,
  onComplete,
  onDismiss,
  returnFocus = null,
  step: controlledStep,
  onStepChange,
}: {
  mode: "first" | "menu";
  /** 마지막 장의 버튼을 눌렀다. */
  onComplete: (result: SessionHelpResult) => void;
  /** Escape로 중간에 닫았다. */
  onDismiss: () => void;
  /**
   * 지금 장(0부터). 다른 화면에 가려 내렸다가 다시 띄울 때 같은 장으로 돌아오도록 호출부가 들고 있을 수 있다.
   * 넘기지 않으면 스스로 들고 첫 장부터 시작한다.
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
  const stepId = step.id;
  const total = SESSION_HELP_STEPS.length;
  // 멈춤 장에서 심플 모드 장으로 넘어갈 때만 일반 화면에서 누르는 손을 보인 뒤 바꾼다.
  const [tapping, setTapping] = useState(false);
  const simple = stepId === "simple" && !tapping;
  const [clockView] = useState(readSessionClockView);
  const [timelapse, setTimelapse] = useTimelapseSettings();
  // 가짜 시계가 흐른 초. 확인 중 장(순공이 흐름)과 구도 장(공부하는 뒷배경)에서만 1초씩 흐르고 다른 장에서는 멈춰 있다.
  const [flowSec, setFlowSec] = useState(0);
  const flowing = stepId === "grace" || stepId === "ready";
  useEffect(() => {
    if (!flowing || prefersReducedMotion()) return;
    const id = window.setInterval(() => setFlowSec((sec) => sec + 1), 1000);
    return () => window.clearInterval(id);
  }, [flowing]);
  const timelapseLabelId = useId();

  // 심플 모드로 바뀌거나 돌아올 때 시계 묶음이 실제 세션처럼 새 자리로 미끄러진다.
  const clockRef = useRef<HTMLDivElement>(null);
  const clockRectBefore = useRef<DOMRect | null>(null);
  useSlideFromRect(clockRef, clockRectBefore, simple);
  const measureClock = () => {
    clockRectBefore.current = clockRef.current?.getBoundingClientRect() ?? null;
  };

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
  useEffect(() => {
    if (!tapping) return;
    const id = window.setTimeout(() => {
      measureClock();
      setTapping(false);
    }, TAP_MS);
    return () => window.clearTimeout(id);
  }, [tapping]);

  const goNext = () => {
    const tap = stepId === "distract" && !prefersReducedMotion();
    if (!tap) measureClock();
    setTapping(tap);
    setStepIndex(stepIndex + 1);
  };
  const goPrev = () => {
    measureClock();
    setTapping(false);
    setStepIndex(stepIndex - 1);
  };
  const complete = (cta: SessionHelpResult["cta"]) =>
    onComplete(
      mode === "first"
        ? { cta, timelapseEnabled: timelapse?.enabled ?? null }
        : { cta, timelapseEnabled: null },
    );

  const held = stepId === "grace" || stepId === "distract";
  const clockState = stepId === "grace" ? "grace" : stepId === "distract" ? "distract" : "focus";
  const statusLabel =
    clockState === "grace"
      ? t("status.grace")
      : clockState === "distract"
        ? t("status.distracted")
        : "";
  const focusSec = DEMO_FOCUS_SEC + flowSec;
  const pipLit = held || stepId === "ready";
  const ready = stepId === "ready";
  const last = stepIndex === total - 1;
  const text = BUBBLE_TEXT[stepId];
  const stepCount = (
    <span className="text-xs leading-4 font-medium text-text-tertiary tabular-nums">
      {t("help.stepCount", { current: stepIndex + 1, total })}
    </span>
  );

  const prevButton = (
    <button
      type="button"
      disabled={stepIndex === 0}
      onClick={goPrev}
      className={cn(BUBBLE_BUTTON, "px-2.5 font-medium text-text-tertiary disabled:opacity-40")}
    >
      {t("help.prev")}
    </button>
  );

  let footer: ReactNode;
  if (!last) {
    footer = (
      <div className="flex items-center gap-1 pt-1.5">
        {stepCount}
        <span className="grow" />
        {prevButton}
        <button type="button" onClick={goNext} className={cn(BUBBLE_BUTTON, "group")}>
          <span className={BUBBLE_PRIMARY}>{t("help.next")}</span>
        </button>
      </div>
    );
  } else if (mode === "first") {
    footer = (
      <>
        {timelapse !== null && (
          <div className="flex min-h-11 items-center gap-2">
            <span id={timelapseLabelId} className="text-[13px] leading-4.5 text-text-tertiary">
              {t("help.timelapse")}
            </span>
            {/* 기본 꺼짐 색(흰 반투명)은 흰 말풍선 위에서 안 보여 말풍선 회색 글자색으로 칠한다. */}
            <Switch
              className="data-[state=unchecked]:bg-text-tertiary/60"
              aria-labelledby={timelapseLabelId}
              checked={timelapse.enabled}
              onCheckedChange={(enabled) => setTimelapse({ ...timelapse, enabled })}
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          {stepCount}
          <span className="grow" />
          {prevButton}
          <button
            type="button"
            onClick={() => complete("start")}
            className={cn(BUBBLE_BUTTON, "group")}
          >
            <span className={BUBBLE_PRIMARY}>{t("help.start")}</span>
          </button>
        </div>
      </>
    );
  } else {
    footer = (
      <div className="flex items-center gap-1 pt-1.5">
        {stepCount}
        <span className="grow" />
        {prevButton}
        <button
          type="button"
          onClick={() => complete("close")}
          className={cn(BUBBLE_BUTTON, "group")}
        >
          <span className={BUBBLE_PRIMARY}>{t("help.close")}</span>
        </button>
      </div>
    );
  }

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
      style={{
        ...sessionSurfaceStyle,
        ...sessionGlowStyle(clockState === "distract" ? "DISTRACTION" : "FOCUS"),
      }}
      className="theme-dark fixed inset-0 z-40 animate-[coach-fade-in_200ms_ease-out] overflow-hidden bg-(--session-camera-base) text-white outline-none motion-reduce:animate-none"
    >
      {/* 심플 모드 바탕. 실제 심플 모드처럼 과목 줄·버튼·하단 바는 그 위에 그대로 둔다. */}
      <SimpleModeSurface hidden={!simple} />
      {/* 가짜 세션 화면. 시계 묶음은 실제 세션처럼 기본은 과목 줄 아래, 심플 모드는 화면 정가운데에 둔다. */}
      <div
        aria-hidden
        className={cn("absolute inset-0 flex flex-col items-center", SESSION_LAYER_INSET)}
      >
        <FakeSessionHeader subject={t("help.sampleSubject")} task={t("help.sampleTask")} />
        <div className={simple ? "grow" : "h-7.5 shrink-0"} />
        <div
          ref={clockRef}
          className={cn(
            simple
              ? "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              : "relative flex flex-col items-center",
            held && "z-20",
          )}
        >
          <SessionClock
            view={clockView}
            studySec={focusSec + 300}
            focusSec={focusSec}
            todayStudySec={focusSec + 4300}
            todayFocusSec={focusSec + 3600}
            state={clockState}
            statusLabel={statusLabel}
            simple={simple}
            fake
          />
        </div>
        <div className="grow" />
        <FakeBar muted={simple} />
      </div>
      <div
        data-testid="help-demo-camera"
        data-demo={held ? "away" : "studying"}
        className={cn(
          PIP_ANCHOR,
          ready ? READY_PIP_SIZE : PIP_SIZE,
          "transition-[opacity,width,height] duration-300 ease-out motion-reduce:transition-none",
          pipLit && "z-20",
          simple && "opacity-0",
        )}
      >
        {/* 영상 안내는 말풍선이 아니라 예시 화면 바로 위에 단다. 창보다 길면 왼쪽으로 늘어난다. */}
        {ready && (
          <p className="absolute right-0 bottom-full mb-2 flex items-center gap-1 text-[13px] leading-5 font-medium whitespace-nowrap text-white/85">
            <LockKeyhole aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
            {t("help.privacy")}
          </p>
        )}
        <div aria-hidden className="relative size-full overflow-hidden rounded-lg bg-black">
          <img
            src={exampleUrl}
            alt=""
            className={cn(
              "size-full object-cover transition-[filter] duration-500 motion-reduce:transition-none",
              held && "blur-[1px] brightness-[.35] saturate-[.3]",
            )}
          />
          {ready && (
            <>
              <PhotoMark
                label={t("help.markFace")}
                className="top-[24%] left-[35%] h-[33%] w-[39%]"
              />
              <PhotoMark
                label={t("help.markHands")}
                className="top-[62%] left-[1%] h-[32%] w-[25%]"
              />
              <PhotoMark
                label={t("help.markTools")}
                className="top-[75%] left-[53%] h-[24%] w-[46%]"
              />
            </>
          )}
        </div>
      </div>

      {!simple && <div aria-hidden className="absolute inset-0 z-10 bg-black/60" />}
      {tapping && <TapMotion />}

      {/* 말풍선. 크기는 dev 마스코트 도움말과 같다: 마스코트 72px, 마스코트 포함 최대 폭 370px. */}
      <div
        className={cn(
          "absolute inset-x-4 z-30 mx-auto flex max-w-92.5 items-end gap-2",
          stepId === "simple"
            ? BUBBLE_BELOW_SIMPLE_CLOCK
            : ready
              ? BUBBLE_ABOVE_READY_PIP
              : BUBBLE_ABOVE_PIP,
        )}
      >
        <HelpMascot pose={step.mascot} />
        <div className="relative flex min-w-0 flex-1 flex-col gap-1.5 rounded-md bg-primary-foreground px-4 pt-3.5 pb-3">
          <p className="text-base leading-5.5 font-bold break-keep whitespace-pre-line text-background">
            <HelpTitle textKey={text.title} highlight={<span className="text-primary" />} />
          </p>
          {text.body !== null && (
            <p className="text-sm leading-5 break-keep text-text-tertiary">{t(text.body)}</p>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
