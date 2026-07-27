import { cn } from "@/lib/utils";

import { formatElapsed, toKoreanDuration } from "../formatDuration";
import type { SessionStatusPillState } from "./SessionStatusPill";

/**
 * 순공 타이머 + 총 공부 병기
 * (Figma 세로 S3-1 `58:358`~`58:359` · S3-3 `59:359` · S3-4 `60:426` /
 *  가로 S3-5 `61:460`~`61:461` · S3-6 `61:531`~`61:532`).
 *
 * - 순공 52px는 표준 타이포 스케일 밖이라 Figma 실측값을 그대로 쓴다.
 * - 프리뷰 표시에서는 집중만 흰색이고 나머지(비집중·일시정지)는 회색이다 — 총 공부는 계속
 *   흐르거나(비집중) 함께 멈추므로(일시정지) 어느 쪽이든 병기 색은 바뀌지 않는다.
 * - `glow`(심플 모드)에서는 숫자가 **상태 컬러 + 발광**이 된다(`design.md` 확정: 심플 모드
 *   타이머 색 = 상태 컬러). 발광 실측값은 Figma Spec 페이지 `14:7`:
 *   `0 0 24 (근거리) 55%` + `0 0 60 (원거리) 35%` — 색은 `sessionGlowStyle`이 주입한다.
 * - 하단 캡션은 이 컴포넌트가 아니라 `SessionCaption`이 그린다 — 심플 모드에는 캡션 행 자체가
 *   없어서(S3-4 실측) 타이머와 수명이 다르다.
 * - `tabular-nums`로 초마다 폭이 흔들리지 않게 한다(voice-tone.md §2).
 *
 * ## 가로(거치) 변형 — S3-5·S3-6
 *
 * 방향은 JS가 아니라 `@media (orientation: landscape)`가 판정한다(회전 시 DOM을 갈아끼우지
 * 않아야 포커스가 유지된다 — SCR-S3-5·S3-6 Accessibility). 그래서 표시 모드(`glow`)만 prop이고
 * 방향은 전부 `landscape:` 유틸리티다.
 *
 * | 표시    | 세로                     | 가로                             |
 * | ------- | ------------------------ | -------------------------------- |
 * | 프리뷰  | 52px 중앙 · 총 15px/42%  | **35px 우측 정렬 · 총 13px/40%** |
 * | 심플    | 52px 중앙 발광           | **56px 중앙 발광**               |
 *
 * ⚠️ 가로 심플 **56px**는 `.ai/product/design.md`가 적은 84px과 어긋난다
 * (SCR-S3-5·S3-6 Current Limitations 2). Figma 실측(`61:531`)이 56px이고 이는
 * `typography.display.lg`(56/64/bold)와 정확히 일치하므로 **토큰 체계와 맞는 Figma 값을 따른다.**
 * 디자이너가 84px로 확정하면 이 한 줄만 고친다.
 *
 * 화면 좌표(`left/top`)는 베끼지 않는다 — 이 컴포넌트는 타이포·정렬만 책임지고 배치(우상단 /
 * 중앙)는 호출부가 `className`으로 넘긴다.
 */
export interface SessionTimerProps {
  /** 순공 시간(초). */
  focusSec: number;
  /** 총 공부 시간(초). */
  studySec: number;
  /** 현재 세션 상태 — 심플 모드의 숫자 색을 결정한다. */
  state: SessionStatusPillState;
  /** 심플 모드(S3-4/S3-6) 발광. 켜면 숫자가 상태 컬러 + text-shadow가 된다. */
  glow?: boolean;
  className?: string;
}

/**
 * 발광 반경은 **숫자 크기에 비례한다** — `em`이라 미디어쿼리 없이 두 방향을 모두 만족한다.
 * 52px(세로)에서 24.0 / 60.0px = Figma Spec `14:7` 실측과 동일,
 * 56px(가로 심플)에서 25.8 / 64.6px = Figma `61:531` 실측(26 / 64)과 동일.
 * 인라인 style은 미디어쿼리를 탈 수 없으므로 반경을 상대 단위로 두는 편이 정확하다.
 */
const GLOW_TEXT_SHADOW =
  "0 0 0.4615em var(--session-glow-near), 0 0 1.1538em var(--session-glow-far)";

export function SessionTimer({
  focusSec,
  studySec,
  state,
  glow = false,
  className,
}: SessionTimerProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center",
        // 가로 프리뷰만 우상단으로 간다 — 가로 심플은 세로와 같은 중앙 정렬을 유지한다.
        !glow && "landscape:items-end",
        className,
      )}
    >
      <p
        className={cn(
          "text-center text-[52px] leading-[60px] font-bold tracking-[-0.5px] tabular-nums transition-colors duration-200 motion-reduce:transition-none",
          glow
            ? "text-[var(--session-state-color)] landscape:text-[56px] landscape:leading-[64px]"
            : cn(
                "landscape:text-right landscape:text-[35px] landscape:leading-[42px] landscape:tracking-[-0.3px]",
                state === "focus" ? "text-white" : "text-text-tertiary",
              ),
        )}
        style={glow ? { textShadow: GLOW_TEXT_SHADOW } : undefined}
      >
        <span aria-hidden="true">{formatElapsed(focusSec)}</span>
        <span className="sr-only">순공시간 {toKoreanDuration(focusSec)}</span>
      </p>
      <p
        className={cn(
          "mt-[7px] text-center text-[15px] leading-[18px] font-medium text-white/42 tabular-nums",
          glow
            ? "landscape:mt-[10px]"
            : "landscape:mt-[3px] landscape:text-right landscape:text-[13px] landscape:leading-[15px] landscape:text-white/40",
        )}
      >
        <span aria-hidden="true">총 {formatElapsed(studySec)}</span>
        <span className="sr-only">총 공부 시간 {toKoreanDuration(studySec)}</span>
      </p>
    </div>
  );
}
