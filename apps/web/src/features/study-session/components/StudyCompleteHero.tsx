import { useEffect, useState } from "react";

import stampImage from "@/assets/study-complete-stamp.png";
import { Badge } from "@/components/ui/badge";

import { toKoreanDurationLength } from "../formatDuration";
import { RESULT_COPY, focusRateLabel } from "../resultCopy";
import type { SessionResultView } from "../sessionResult";

/**
 * 히어로의 연출 단계 — `ResultPage`가 정한다.
 *
 * - `intro`: 도장이 찍히고 타이틀·순공시간이 차례로 떠오르는 구간. 카드·CTA는 아직 없다.
 * - `revealed`: 인주·타이틀 블록이 접혀 올라가고 순공시간이 위로 붙는다 — 그 아래로 타임라인·
 *   통계 카드가 드러난다(프로토타입 `reveal()`).
 * - `static`: 모션 축소(`prefers-reduced-motion`) — 연출도 접힘도 없이 처음부터 전부 보여준다.
 *   접힘까지 따라가면 모션 축소 사용자는 `오늘 공부 완료!`를 한 번도 보지 못한다.
 */
export type CompleteHeroPhase = "intro" | "revealed" | "static";

/** 순공시간 카운트업 — 프로토타입 `animate('pure', …, 1300, 950)` 그대로. */
const COUNT_UP_DURATION_MS = 1300;
const COUNT_UP_DELAY_MS = 950;

/**
 * S4 공부 완료 히어로(BY-560) — BY-557 시안 프로토타입의 "1 · 완료" 화면을 옮긴 것.
 *
 * 도장(PNG)이 위에서 내려와 찍히고(`result-stamp-press` 2s), 닿는 순간(0.82s) 인주가 튀어나오며
 * 충격 링이 퍼진다. 타이틀(0.55s)·설명(0.66s)·순공시간(0.78s, 0.95s부터 1.3s 카운트업)·총 공부
 * (0.9s)·집중률 배지(1.0s)가 차례로 떠오른다. 지연값은 프로토타입 실측이라 서로 맞물려 있다 —
 * 하나만 바꾸면 순서가 어긋난다.
 *
 * 예전 `ResultHeader`(타이틀 `공부 결과` · 우상단 닫기 · 순공시간 · 집중률 필 · `총 공부 N ·
 * HH:MM–HH:MM`)를 대체한다. 시각 범위는 히어로에서 빠졌다 — 타임라인 카드 축 라벨이 같은 값을
 * 이미 보여준다.
 *
 * ## 이 컴포넌트가 하지 않는 것
 *
 * 단계 전환(언제 `revealed`로 갈지)은 `ResultPage`가 타이머로 정한다. 여기는 받은 단계를 그리고
 * 전환(`transition`)만 맡는다. 값 계산도 없다 — `SessionResultView`를 그대로 그린다.
 *
 * ## 절대 좌표를 베끼지 않는다
 *
 * 프로토타입은 iOS 프레임 안 절대 배치(`top: 104px` 스테이지)다. 여기서는 스크롤 컨테이너 흐름
 * 안에 두고 도장·글로우만 절대 배치한다(둘 다 장식이라 흐름에서 빼도 레이아웃이 안 깨진다).
 * 인트로 블록의 `max-height: 300px`(접힘 전환용)은 폰트 2배 확대까지 담는다.
 */
export function StudyCompleteHero({
  view,
  phase,
}: {
  view: SessionResultView;
  phase: CompleteHeroPhase;
}) {
  const collapsed = phase === "revealed";
  const animated = phase !== "static";
  const focusSec = useCountUp(view.focusSec, animated);

  return (
    // `isolate`: 글로우를 `-z-10`으로 텍스트 **뒤**에 두기 위한 스태킹 컨텍스트. 없으면 절대 배치인
    // 글로우가 흐름 안 텍스트 위에 칠해져 타이틀·숫자가 뿌옇게 바랜다(모션 축소·접힘 전 레이아웃에서
    // 실제 확인). 음수 z-index는 자기 스태킹 컨텍스트 배경 뒤로만 가므로 섹션이 컨텍스트여야 한다.
    <section className="relative isolate flex w-full flex-col items-center">
      {/* 도장 — 인트로 동안만 존재한다. `both`라 모션이 끝나면 투명하게 남고, 접히면서 사라진다.
          장식이라 alt는 비운다(찍힌 결과는 아래 인주·타이틀이 말한다). */}
      {phase === "intro" && (
        <img
          src={stampImage}
          alt=""
          draggable={false}
          className="pointer-events-none absolute top-[44px] left-1/2 z-[8] size-44 origin-bottom animate-[result-stamp-press_2s_cubic-bezier(0.5,0,0.4,1)_both] motion-reduce:hidden"
        />
      )}

      {/* 글로우 — 바깥은 접힘에 맞춰 사라지는 페이드, 안쪽은 호흡 애니메이션. 한 요소에 두면
          animation의 opacity가 inline opacity를 덮어 페이드가 안 먹는다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[44px] left-1/2 -z-10 -ml-[170px] size-[340px] transition-opacity duration-500 motion-reduce:transition-none"
        style={{ opacity: collapsed ? 0 : 1 }}
      >
        <div className="size-full rounded-full bg-[radial-gradient(circle,var(--color-brand-subtle)_0%,transparent_68%)] animate-[result-hero-glow_3s_ease-in-out_infinite] motion-reduce:animate-none" />
      </div>

      <div
        className="flex w-full flex-col items-center transition-[margin-top] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ marginTop: collapsed ? 8 : animated ? 150 : 24 }}
      >
        {/* 인트로 블록: 인주 + 타이틀 + 설명. 접히면 높이 0·투명·위로 22px — DOM에는 남기되
            보이지 않는 텍스트를 스크린리더가 읽지 않게 aria-hidden을 함께 건다. */}
        <div
          aria-hidden={collapsed}
          className="flex w-full flex-col items-center overflow-hidden [transition:max-height_0.55s_cubic-bezier(0.22,1,0.36,1),opacity_0.4s_ease,transform_0.5s_ease] motion-reduce:transition-none"
          style={
            collapsed
              ? { maxHeight: 0, opacity: 0, transform: "translateY(-22px)" }
              : animated
                ? { maxHeight: 300 }
                : undefined
          }
        >
          <div className="relative mb-[30px] size-[118px]">
            {/* 충격 링 — `forwards`다. 프로토타입의 `both`는 지연 동안 0% 프레임(반투명 링)이
                미리 보이는 부작용이 있어 여기서는 닿기 전까지 숨긴다. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-[2.5px] border-stamp-seal/30 opacity-0 animate-[result-stamp-impact_0.7s_ease-out_0.82s_forwards] motion-reduce:hidden"
            />
            <div className="absolute inset-0 flex items-center justify-center animate-[result-seal-pop_0.55s_cubic-bezier(0.34,1.56,0.64,1)_0.82s_both] motion-reduce:animate-none">
              <SealIcon />
            </div>
          </div>

          <h1 className="text-[24px] leading-[29px] font-extrabold tracking-[-0.3px] text-foreground animate-[result-fade-up_0.5s_ease-out_0.55s_both] motion-reduce:animate-none">
            {RESULT_COPY.completeTitle}
          </h1>
          <p className="mt-2 text-[14px] leading-[17px] text-muted-foreground animate-[result-fade-up_0.5s_ease-out_0.66s_both] motion-reduce:animate-none">
            {RESULT_COPY.completeDescription}
          </p>
        </div>

        <div
          className="flex flex-col items-center gap-[6px] transition-[margin-top] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] animate-[result-fade-up_0.5s_ease-out_0.78s_both] motion-reduce:animate-none motion-reduce:transition-none"
          style={{ marginTop: collapsed ? 4 : animated ? 34 : 24 }}
        >
          <p className="text-[13px] leading-[15px] font-medium text-muted-foreground">
            {RESULT_COPY.focusLabel}
          </p>
          <p className="text-[44px] leading-[52px] font-extrabold tracking-[-1px] text-foreground tabular-nums">
            {toKoreanDurationLength(focusSec)}
          </p>
        </div>

        {/* 총 공부 = 일시정지를 뺀 값이라 타임라인 축의 벽시계 범위와 다를 수 있다 — 맞추려
            들지 않는다(SCR-S4 QA 회부 규칙). */}
        <p className="mt-[6px] text-[13px] leading-[16px] tabular-nums animate-[result-fade-up_0.5s_ease-out_0.9s_both] motion-reduce:animate-none">
          <span className="text-muted-foreground">{`${RESULT_COPY.totalPrefix} `}</span>
          <span className="font-semibold text-foreground">
            {toKoreanDurationLength(view.studySec)}
          </span>
        </p>

        <Badge className="mt-[10px] pl-[9px] animate-[result-badge-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_1s_both] motion-reduce:animate-none">
          <FocusCheck />
          {focusRateLabel(view.focusRatePercent)}
        </Badge>
      </div>
    </section>
  );
}

/**
 * 순공시간 카운트업 — 0에서 목표값까지 ease-out(cubic)으로 오른다.
 *
 * 표시는 분 단위(`toKoreanDurationLength`)라 첫 프레임 잠깐 `1분 미만`이 보였다가 분이 올라간다.
 * 서버 값을 바꾸는 게 아니라 **표시가 목표값에 도달하는 연출**이다 — 끝값은 항상 `target`이다.
 * `enabled`가 아니면(모션 축소) 처음부터 목표값이다. rAF가 없는 환경(테스트)도 같다.
 */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }
    let frame = 0;
    const startAt = performance.now() + COUNT_UP_DELAY_MS;
    const step = (now: number) => {
      const progress = Math.min(Math.max((now - startAt) / COUNT_UP_DURATION_MS, 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return value;
}

/**
 * 인주(도장 자국) — 프로토타입 SVG 그대로(이중 원 + 발자국). 색은 `stamp-seal` 토큰 하나를
 * `currentColor`로 받는다.
 */
function SealIcon() {
  return (
    <svg
      width="100"
      height="100"
      viewBox="0 0 100 100"
      className="rotate-[-6deg] text-stamp-seal"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="50" r="46.5" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <g transform="translate(19 25) scale(0.62)" fill="currentColor">
        <ellipse cx="14" cy="34" rx="9.5" ry="11" />
        <ellipse cx="35" cy="15.5" rx="11.5" ry="13.5" />
        <ellipse cx="65" cy="15.5" rx="11.5" ry="13.5" />
        <ellipse cx="86" cy="34" rx="9.5" ry="11" />
        <path d="M50 34 C64 34 77 43 77 59 C77 70 70 79 61 79 C56.5 79 53 76 50 76 C47 76 43.5 79 39 79 C30 79 23 70 23 59 C23 43 36 34 50 34 Z" />
      </g>
    </svg>
  );
}

/**
 * 집중률 배지의 체크 아이콘(BY-560 2차 시안 스크린샷, 2026-09-14) — 프라이머리 원 안에 흰 체크.
 * 체크 path는 `CheckCircle`(Figma `icon/check` 63:588)과 같은 값이다 — 손으로 그리지 않는다.
 * 정보는 옆 텍스트(`N% 집중`)가 전달하므로 아이콘은 장식이다.
 */
function FocusCheck() {
  return (
    <span
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <svg
        width="9"
        height="7"
        viewBox="0 0 19.1333 14.4667"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <path
          d="M1.4 7.23335L7.23333 13.0667L17.7333 1.40001"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
