import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { MascotFigure } from "@/components/mascot/MascotFigure";
import {
  MASCOT_EXPRESSION_SRC,
  MASCOT_FOOT_Y,
  jumpTiltTransform,
} from "@/components/mascot/mascotExpressions";
import { splitAccessoryLayers } from "@/components/mascot/mascotLayers";
import type { MascotId, MascotLook } from "@/components/mascot/types";
import { Badge } from "@/components/ui/badge";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

import { toKoreanDurationLength } from "../formatDuration";
import type { SessionResultView } from "../sessionResult";

/**
 * 히어로의 연출 단계
 *
 * - `intro`: 마스코트가 뛰어오르고 타이틀·순공시간이 차례로 떠오르는 구간. 카드·CTA는 아직 없다.
 * - `revealed`: 마스코트·타이틀 블록이 접혀 올라가고 순공시간이 위로 붙는다
 *   — 그 아래로 타임라인·통계 카드가 드러난다
 * - `static`: 모션 축소(`prefers-reduced-motion`)
 *   — 연출도 접힘도 없이 처음부터 전부 보여준다. 접힘까지 따라가면 모션 축소 사용자는 `오늘 공부 완료`를 한 번도 보지 못한다.
 */
export type CompleteHeroPhase = "intro" | "revealed" | "static";

/** 순공시간 카운트업 — 프로토타입 `animate('pure', …, 1300, 950)` 그대로. */
// 카운트업을 시작하는 값(초). 1분.
const COUNT_UP_FROM_SEC = 60;
const COUNT_UP_DURATION_MS = 1300;
const COUNT_UP_DELAY_MS = 950;

/**
 * 마스코트가 정점에 닿는 시점
 *
 * `result-mascot-jump`가 끝나는 시각이다.
 * 정점에 멈춘 뒤에는 이벤트가 없어 햅틱을 타이머로 맞춘다.
 */
const MASCOT_APEX_MS = 920;

/**
 * 마스코트 판의 크기와 자리
 *
 * 74×94 상자 기준의 px이며 타이미가 예전 표정 그림과 같은 크기와 자리에 오도록 맞춘 값이다.
 * 판은 디자인의 표정 그림을 1배 화면에서 한 변 111.36px로 그린 크기다.
 * 위치는 타이미의 발끝 기준이고 발끝이 높은 마스코트는 판을 그만큼 내려 바닥에서 그림자에 닿게 한다.
 */
const BOARD_PX = 111.36;
const BOARD_LEFT_PX = -18.42;
const TIMI_BOARD_TOP_PX = -5.5;

function boardStyle(id: MascotId): CSSProperties {
  const top = TIMI_BOARD_TOP_PX + (MASCOT_FOOT_Y.stopwatch - MASCOT_FOOT_Y[id]) * BOARD_PX;
  return { left: `${BOARD_LEFT_PX}px`, top: `${Number(top.toFixed(2))}px`, width: `${BOARD_PX}px` };
}

// 고른 모습을 아직 모르면 소품 없는 타이미로 뛰어오른다.
const DEFAULT_LOOK: MascotLook = { id: "stopwatch", accessories: [] };

// 그리는 순서와 표정마다 거는 keyframes. Tailwind가 클래스를 찾도록 문자열을 통째로 둔다.
const FACE_ANIMATIONS = [
  ["idle", "animate-[result-mascot-face-idle_0.92s_step-end_both]"],
  ["squint", "animate-[result-mascot-face-squint_0.92s_step-end_both]"],
  ["closed", "animate-[result-mascot-face-closed_0.92s_step-end_both]"],
  ["peak", "animate-[result-mascot-face-peak_0.92s_step-end_both]"],
] as const;

const TILT_ANIMATION =
  "animate-[result-mascot-tilt_0.92s_step-end_both] motion-reduce:animate-none";

/**
 * 정점에서 소품을 몸에 맞추는 기울기
 *
 * 기본 자리가 정점이라 기울인 transform을 그대로 두고, 연출 중에는 keyframes가 표정이 바뀌는 순간까지 기울기를 푼다.
 * keyframes가 마스코트마다 다른 값을 읽도록 같은 값을 변수로도 둔다.
 */
function tiltFrame(id: MascotId, jumping: boolean) {
  const transform = jumpTiltTransform(id);
  return {
    className: cn(jumping && TILT_ANIMATION),
    style: { "--result-mascot-tilt": transform, transform } as CSSProperties,
  };
}

/**
 * 공부 완료 히어로
 *
 * 마스코트가 웅크렸다 뛰어올라 정점(0.92s)에 멈추고, 바닥 그림자는 높이에 따라 작아지고 옅어진다.
 * 웅크리는 동안 표정이 기본, 정색, 눈 감음, 정색으로 바뀌고 뛰어오르는 순간 웃는다.
 * 타이틀(0.55s)·설명(0.66s)·순공시간(0.78s, 0.95s부터 1.3s 카운트업)·총 공부
 * (0.9s)·집중률 배지(1.0s)가 차례로 떠오른다.
 * 고른 마스코트가 소품을 낀 채로 뛰어오르고 몸 그림만 표정마다 바뀐다.
 * 점프 그림은 몸이 기울어 있어 소품도 같은 순간에 같은 만큼 기운다.
 * 세트는 발을 덮거나 발밑에 깔려 다리를 모은 점프 그림과 어긋나므로, 다리를 펴고 웃는 그림을 몸과 세트째 기울인다.
 */
export function StudyCompleteHero({
  view,
  phase,
  look,
}: {
  view: SessionResultView;
  phase: CompleteHeroPhase;
  look?: MascotLook | null;
}) {
  const { t } = useTranslation("study-session");
  const collapsed = phase === "revealed";
  const animated = phase !== "static";
  const focusSec = useCountUp(view.focusSec, animated);
  const jumping = phase === "intro";
  const { id, accessories } = look ?? DEFAULT_LOOK;
  const { wearsSet } = splitAccessoryLayers(accessories);
  const expressions = MASCOT_EXPRESSION_SRC[id];
  const faces = {
    idle: expressions.idle,
    squint: expressions.squint,
    closed: expressions.closed,
    peak: wearsSet ? expressions.joy : expressions.jump,
  };
  const tilt = tiltFrame(id, jumping);
  // 낱개 발밑 소품은 바닥에 두고 마스코트만 뛰어오른다. 세트는 바닥 소품이 옷과 한 장이라 함께 뛴다.
  const underfoot = wearsSet
    ? []
    : accessories.filter((accessory) => accessory.slot === "underfoot");
  const worn = wearsSet
    ? accessories
    : accessories.filter((accessory) => accessory.slot !== "underfoot");

  useEffect(() => {
    if (!jumping) {
      return;
    }
    const timer = window.setTimeout(() => haptic("heavy"), MASCOT_APEX_MS);
    return () => window.clearTimeout(timer);
  }, [jumping]);

  return (
    // `isolate`: 글로우를 `-z-10`으로 텍스트 **뒤**에 두기 위한 스태킹 컨텍스트. 없으면 절대 배치인
    // 글로우가 흐름 안 텍스트 위에 칠해져 타이틀·숫자가 뿌옇게 바랜다(모션 축소·접힘 전 레이아웃에서
    // 실제 확인). 음수 z-index는 자기 스태킹 컨텍스트 배경 뒤로만 가므로 섹션이 컨텍스트여야 한다.
    <section className="relative isolate flex w-full flex-col items-center">
      {/* 글로우 — 바깥은 접힘에 맞춰 사라지는 페이드, 안쪽은 호흡 애니메이션. 한 요소에 두면
          animation의 opacity가 inline opacity를 덮어 페이드가 안 먹는다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-11 left-1/2 -z-10 -ml-42.5 size-85 transition-opacity duration-500 motion-reduce:transition-none"
        style={{ opacity: collapsed ? 0 : 1 }}
      >
        <div className="size-full rounded-full bg-[radial-gradient(circle,var(--color-brand-subtle)_0%,transparent_68%)] animate-[result-hero-glow_3s_ease-in-out_infinite] motion-reduce:animate-none" />
      </div>

      <div
        className="flex w-full flex-col items-center transition-[margin-top] duration-550 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        // 모션 축소에서도 정점의 마스코트가 슬롯 위로 넘치므로 그만큼 더 띄운다.
        style={{ marginTop: collapsed ? 8 : animated ? 150 : 80 }}
      >
        {/* 인트로 블록: 마스코트 + 타이틀 + 설명. 접히면 높이 0·투명·위로 22px — DOM에는 남기되
            보이지 않는 텍스트를 스크린리더가 읽지 않게 aria-hidden을 함께 건다.
            접힘에 필요한 overflow-hidden이 슬롯 위로 넘친 마스코트를 자르지 않게 위 여백을 늘리고 같은 만큼 끌어올린다.
            여백은 정점에서 기운 소품 판의 위 끝(슬롯 위 약 93px)까지 덮는다. */}
        <div
          aria-hidden={collapsed}
          className="-mt-24 flex w-full flex-col items-center overflow-hidden pt-24 [transition:max-height_0.55s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s_ease,transform_0.5s_ease] motion-reduce:transition-none"
          style={
            collapsed
              ? { maxHeight: 0, opacity: 0, transform: "translateY(-22px)" }
              : animated
                ? { maxHeight: 300 }
                : undefined
          }
        >
          {/* 기본 자리는 정점이라 모션 축소와 다시 본 결과는 애니메이션 없이 정점 자세를 바로 보인다. */}
          {/* 바닥에 남은 발밑 소품은 아래 끝이 제목에 붙어 보여 그때만 16px 더 띄운다. */}
          <div
            data-result-mascot-slot=""
            className={cn("relative size-18", underfoot.length > 0 ? "mb-8.5" : "mb-4.5")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-17.5 left-1/2 h-1.75 w-9 -translate-x-1/2 rounded-full bg-(--result-mascot-shadow) opacity-62 blur-xs",
                jumping && "animate-[result-mascot-shadow_0.92s_both] motion-reduce:animate-none",
              )}
            />
            {/* 발밑 소품은 바닥에 선 마스코트 자리(뛰는 상자의 바닥 자세)에 멈춰 있다.
                몸은 그리지 않고 마스코트와 같이 나타나도록 투명도만 맞춘다. */}
            {underfoot.length > 0 && (
              <div
                data-result-mascot-ground=""
                className={cn(
                  "pointer-events-none absolute bottom-0 left-0.75 h-23.5 w-18.5",
                  jumping && "animate-[result-mascot-ground_0.92s_both] motion-reduce:animate-none",
                )}
              >
                <div data-result-mascot-board="" className="absolute" style={boardStyle(id)}>
                  <MascotFigure id={id} accessories={underfoot} body={false} className="w-full" />
                </div>
              </div>
            )}
            {/* 움직임은 컨테이너가, 표정 교체는 각 그림이 맡는다.
                네 장을 처음부터 그려 두어 첫 교체 전에 디코드가 끝난다.
                bottom-9·left-0.75는 점프 표정 기준의 정점 자리다.
                기본 표정은 몸통이 5.6px 아래에 그려져 있어 바닥(36px 아래)에서 발끝이 그림자에 닿는다. */}
            <div
              data-result-mascot=""
              className={cn(
                "pointer-events-none absolute bottom-9 left-0.75 h-23.5 w-18.5 origin-bottom",
                jumping && "animate-[result-mascot-jump_0.92s_both] motion-reduce:animate-none",
              )}
            >
              <div data-result-mascot-board="" className="absolute" style={boardStyle(id)}>
                {wearsSet ? (
                  <div data-result-mascot-tilt="" className={tilt.className} style={tilt.style}>
                    <MascotFigure
                      id={id}
                      accessories={worn}
                      body={<ResultFaces faces={faces} jumping={jumping} />}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <MascotFigure
                    id={id}
                    accessories={worn}
                    body={<ResultFaces faces={faces} jumping={jumping} />}
                    layerFrame={tilt}
                    className="w-full"
                  />
                )}
              </div>
            </div>
          </div>

          <h1 className="text-[20px] leading-6 font-extrabold tracking-[-0.4px] text-foreground animate-[result-fade-up_0.5s_ease-out_0.55s_both] motion-reduce:animate-none">
            {t("result.completeTitle")}
          </h1>
          <p className="mt-1 text-[13px] leading-4 text-muted-foreground animate-[result-fade-up_0.5s_ease-out_0.66s_both] motion-reduce:animate-none">
            {t("result.completeDescription")}
          </p>
        </div>

        <div
          className="flex flex-col items-center gap-0.5 transition-[margin-top] duration-550 ease-[cubic-bezier(0.22,1,0.36,1)] animate-[result-fade-up_0.5s_ease-out_0.78s_both] motion-reduce:animate-none motion-reduce:transition-none"
          style={{ marginTop: collapsed ? 4 : animated ? 34 : 22 }}
        >
          <p className="text-[12px] leading-3.75 font-bold text-muted-foreground">
            {t("result.focusLabel")}
          </p>
          <p className="text-[40px] leading-11.5 font-extrabold tracking-[-1.2px] text-foreground tabular-nums">
            {toKoreanDurationLength(focusSec)}
          </p>
        </div>

        {/* 총 공부 = 일시정지를 뺀 값이라 타임라인 축의 벽시계 범위와 다를 수 있다. */}
        <p className="mt-2 text-[14px] leading-4.25 tabular-nums animate-[result-fade-up_0.5s_ease-out_0.9s_both] motion-reduce:animate-none">
          <span className="text-muted-foreground">{`${t("result.totalPrefix")} `}</span>
          <span className="font-bold text-foreground">{toKoreanDurationLength(view.studySec)}</span>
        </p>

        <Badge className="mt-2.5 animate-[result-badge-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_1s_both] motion-reduce:animate-none">
          {t("result.focusRate", { percent: view.focusRatePercent })}
        </Badge>
      </div>
    </section>
  );
}

/**
 * 겹쳐 둔 표정 그림
 *
 * 한 장만 보이고 step-end keyframes로 순간 교체한다.
 * 정점 표정만 기본으로 보여 애니메이션이 없는 모션 축소와 다시 본 결과에서는 정점 표정만 남는다.
 */
function ResultFaces({
  faces,
  jumping,
}: {
  faces: Record<(typeof FACE_ANIMATIONS)[number][0], string>;
  jumping: boolean;
}) {
  return FACE_ANIMATIONS.map(([face, animation]) => (
    <img
      key={face}
      src={faces[face]}
      alt=""
      draggable={false}
      className={cn(
        "absolute inset-0 size-full",
        face !== "peak" && "opacity-0",
        jumping && [animation, "motion-reduce:animate-none"],
      )}
    />
  ));
}

/**
 * 순공시간 카운트업
 *
 * — 1분에서 목표값까지 ease-out(cubic)으로 오른다.
 *
 * 0에서 올리면 첫 프레임과 시작 지연(950ms) 동안 값이 `0초`로 떠, 오르기 전에 "공부를 못 했다"처럼
 * 읽힌다. 그래서 1분부터 올린다. 1분 미만 세션도 이 화면에 오지만 목표값을 그대로 보여준다.
 */
function useCountUp(target: number, enabled: boolean): number {
  const from = Math.min(COUNT_UP_FROM_SEC, target);
  const [value, setValue] = useState(enabled ? from : target);
  const canAnimate = enabled && typeof requestAnimationFrame === "function";

  useEffect(() => {
    if (!canAnimate) {
      return;
    }
    let frame = 0;
    const startAt = performance.now() + COUNT_UP_DELAY_MS;
    const step = (now: number) => {
      const progress = Math.min(Math.max((now - startAt) / COUNT_UP_DURATION_MS, 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, canAnimate, from]);

  return canAnimate ? value : target;
}
