import { cn } from "@/lib/utils";

/**
 * S4 타임라인 카드의 상태 색 조각 — 범례 도트와 바 세그먼트. 같은 색 매핑을 쓰기 위해 한 파일이다.
 *
 * 카드 셸·타이틀은 2026-09-14(BY-560) 사용자 요청으로 `components/ui/card.tsx`(shadcn 스타일)로
 * 승격됐다. 여기 남은 둘은 이 화면 전용 상태색 조각이라 feature에 co-locate 한다.
 */

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
