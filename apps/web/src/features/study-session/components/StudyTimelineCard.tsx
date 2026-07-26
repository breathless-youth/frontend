import { LEGEND_COPY, RESULT_COPY } from "../resultCopy";
import type { SessionResultView } from "../sessionResult";
import { formatClockTime, timelineSummaryLabel } from "../sessionResult";
import type { ResultStatusTone } from "./ResultCardParts";
import { ResultBarSegment, ResultCard, ResultCardTitle, ResultStatusDot } from "./ResultCardParts";

/**
 * 공부 타임라인 카드 (Figma `timeline-card` 64:561).
 *
 * 세션 **벽시계** 구간을 바 하나로 펴고, 그 위에 비집중(오렌지)·일시정지(회색) 구간을 얹는다.
 * 바탕은 집중(브랜드 블루)이다 — 즉 "아무것도 얹히지 않은 곳 = 집중"이다.
 *
 * ## ⚠️ Figma 반영 지연 — 3색으로 그린다
 *
 * Figma 원본은 범례가 2색(집중·비집중)이고 회색 세그먼트가 없다(`64:572`). 이는 2026-07-26
 * 6차 확정("S4 타임라인 범례 3색")의 **미반영**이며 상충이 아니다(`design.md` 백로그 7번①).
 * 확정 표기를 적용해 **일시정지(회색)를 세그먼트·범례 모두에 추가**한다 — 단, 일시정지가
 * 0건이면 회색은 어디에도 나타나지 않는다.
 *
 * ## 접근성
 *
 * 바 자체는 정보를 전달하지 못하는 시각 요소라 `role="img"` + 요약 `aria-label`을 준다
 * (SCR-S4 Accessibility). 범례는 도트 + 텍스트를 항상 병기한다 — 색 단독 전달 금지.
 */
export function StudyTimelineCard({ view }: { view: SessionResultView }) {
  const hasDistraction = view.distractions.length > 0;
  const hasPause = view.pause !== null;

  return (
    <ResultCard className="flex flex-col gap-[10px] pt-4 pb-[14px]">
      <ResultCardTitle>{RESULT_COPY.timelineTitle}</ResultCardTitle>

      <div
        role="img"
        aria-label={timelineSummaryLabel(view)}
        className="relative h-3 w-full overflow-hidden rounded-full bg-primary"
      >
        {view.segments.map((segment) => (
          <ResultBarSegment
            key={`${segment.status}-${segment.startRatio}`}
            tone={segment.status === "PAUSE" ? "pause" : "distract"}
            startRatio={segment.startRatio}
            widthRatio={segment.widthRatio}
          />
        ))}
      </div>

      {/* 축 라벨 = 세션 시작·종료 벽시계(`64:570`/`64:571`). 총 공부 시간이 아니다. */}
      <div className="flex justify-between text-[11px] leading-[13px] text-text-tertiary tabular-nums">
        <span>{formatClockTime(view.startedAt)}</span>
        <span>{formatClockTime(view.endedAt)}</span>
      </div>

      <ul className="flex flex-wrap items-center gap-x-[14px] gap-y-1">
        {/* 집중은 항상 있다 — 바탕색이 집중이므로 범례에서 뺄 수 없다. */}
        <LegendItem tone="focus" label={LEGEND_COPY.focus} />
        {hasDistraction && <LegendItem tone="distract" label={LEGEND_COPY.distract} />}
        {hasPause && <LegendItem tone="pause" label={LEGEND_COPY.pause} />}
      </ul>
    </ResultCard>
  );
}

function LegendItem({ tone, label }: { tone: ResultStatusTone; label: string }) {
  return (
    <li className="flex items-center gap-[5px]">
      <ResultStatusDot tone={tone} />
      <span className="text-[11px] leading-[13px] text-muted-foreground">{label}</span>
    </li>
  );
}
