import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * S4 결과 카드의 공통 조각 — 타임라인 카드(`64:561`)와 통계 카드(`64:622`)가 함께 쓴다.
 *
 * **범용 컴포넌트로 승격하지 않는다**(루트 CLAUDE.md "과도한 추상화 금지") — 실제 소비자가
 * 이 화면의 두 카드뿐이라 `features/study-session/components/`에 co-locate 한다.
 */

/**
 * 카드 셸: `bg/layer-1` + `border/default` + `radius.lg`(16).
 *
 * 세로 패딩은 카드마다 다르다(타임라인 pt16/pb14 · 통계 pt16/pb6) — Figma 실측이 다르므로
 * 하나로 뭉개지 않고 `className`으로 받는다.
 */
export function ResultCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-muted px-4", className)}>
      {children}
    </section>
  );
}

/** 카드 타이틀 14px SemiBold. 화면 타이틀이 `h1`이므로 카드 제목은 `h2`다. */
export function ResultCardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[14px] leading-[17px] font-semibold text-foreground">{children}</h2>;
}

/**
 * 상태 도트 6px (Figma `64:574`/`64:577`/`64:626` …).
 *
 * **색을 단독으로 정보 전달에 쓰지 않는다** — 이 도트는 항상 텍스트 라벨과 짝을 이루고
 * 스스로는 `aria-hidden`이다(`design.md` 상태 컬러 보조 규칙 ①). 일시정지 회색도 예외가 아니다.
 *
 * Figma는 도트를 이미지(`<img src=…ellipse>`)로 내보내지만 **단색 원**이라 자산으로 커밋하지
 * 않고 토큰 배경으로 그린다 — 그래야 라이트/다크가 함께 따라간다.
 */
export type ResultStatusTone = "focus" | "distract" | "pause";

const TONE_CLASS: Record<ResultStatusTone, string> = {
  focus: "bg-primary",
  distract: "bg-state-distract",
  // 일시정지 전용 상태색은 없다 — `text/tertiary`를 재사용한다(design-tokens `sessionStateColors.PAUSE`).
  pause: "bg-text-tertiary",
};

export function ResultStatusDot({ tone }: { tone: ResultStatusTone }) {
  return (
    <span aria-hidden="true" className={cn("size-[6px] shrink-0 rounded-full", TONE_CLASS[tone])} />
  );
}

/**
 * 타임라인 바 위의 한 구간 (Figma `64:564`~`64:568`).
 *
 * 도트와 **같은 색 매핑**을 쓰기 위해 같은 파일에 둔다 — 범례 도트와 바 세그먼트의 색이
 * 어긋나면 색으로 이어지는 대응이 깨진다.
 *
 * 위치·폭은 세션 벽시계 구간에 대한 비율이므로 px가 아니라 %로 준다(카드 폭이 기기마다 다름).
 */
export function ResultBarSegment({
  tone,
  startRatio,
  widthRatio,
}: {
  tone: ResultStatusTone;
  startRatio: number;
  widthRatio: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute inset-y-0", TONE_CLASS[tone])}
      style={{ left: `${startRatio * 100}%`, width: `${widthRatio * 100}%` }}
    />
  );
}
