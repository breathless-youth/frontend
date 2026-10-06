import type { StudySessionSummary } from "@focusmakers/types";

import {
  ResultBarSegment,
  ResultLegendItem,
} from "@/features/study-session/components/ResultCardParts";
import { LEGEND_COPY } from "@/features/study-session/resultCopy";
import { longestFocusStretch, timelineSegments } from "@/features/study-session/sessionResult";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

import { IconChevronDown } from "./icons";
import { durationParts, formatDuration, formatFocusRate, formatKstClock } from "./recordsFormat";
import { Badge } from "@/components/ui/badge";

type SessionListItemProps = {
  session: StudySessionSummary;
  /** 목록 안에서의 구분선 등 — 줄(`li`)에 붙는다. */
  className?: string;
};

/**
 * 세션 행
 *
 * 접힌 채로도 순공·총 공부시간·집중률·흐름(미니 타임라인)이 보이고, 탭하면 그 자리에서 행에 없는
 * 것만 펼친다 — 시작 시간 · 종료 시간 · 최대 집중 시간. 펼침은 공용 Accordion의 한 항목이라
 * 반드시 `Accordion` 안에서 쓴다 — 한 번에 하나만 펼치는 것도 Accordion이 맡는다. 명세가 모션을
 * 더하지 않기로 해서 펼침 애니메이션은 끈다.
 * 타임라인 색의 뜻은 목록 맨 아래의 범례(`SessionTimelineLegend`)가 한 번 알려 준다.
 */
export function SessionListItem({ session, className }: SessionListItemProps) {
  const startClock = formatKstClock(session.startedAt);
  const endClock = formatKstClock(session.endedAt);

  // 공부 결과 화면의 타임라인과 같은 계산·같은 조각이다 — 순공색 바탕 위에 순공이 아닌 구간만 얹는다.
  const segments = timelineSegments({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    events: session.events ?? [],
  });

  return (
    <AccordionItem value={String(session.id)} asChild className={cn("border-b-0", className)}>
      <li>
        <AccordionTrigger
          // 꺾쇠는 집중률 알약 옆 제자리에 따로 둔다.
          hideChevron
          aria-label={`${startClock}부터 ${endClock}까지, 순공 ${formatDuration(session.focusSec)}, 집중 ${formatFocusRate(session.focusRate)}`}
          className="group flex-col items-stretch gap-2.5 py-3.5 font-normal"
        >
          <span className="flex w-full items-start justify-between">
            <span className="flex min-w-0 flex-col gap-[3px]">
              <span className="flex items-baseline gap-1.5 pr-1 text-foreground tabular-nums">
                {durationParts(session.focusSec).map((part, index) => (
                  <span key={part.unit} className="flex items-baseline gap-px">
                    {index > 0 ? " " : ""}
                    <span className="text-[22px] leading-[26px] font-extrabold">{part.value}</span>
                    <span className="text-[13px] leading-4 font-bold">{part.unit}</span>
                  </span>
                ))}
              </span>
              <span className="text-[13px] leading-4 text-muted-foreground tabular-nums">
                총 {formatDuration(session.studySec)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 pt-0.5">
              <Badge className="h-6 px-[9px] py-0 text-xs leading-4 font-semibold">
                집중 {formatFocusRate(session.focusRate)}
              </Badge>
              <IconChevronDown size={10} className="group-data-[state=open]:rotate-180" />
            </span>
          </span>

          <span className="flex w-full flex-col gap-[5px]">
            <span
              aria-hidden
              className="relative block h-2 w-full overflow-hidden rounded-full bg-primary"
            >
              {segments.map((segment) => (
                <ResultBarSegment
                  key={`${segment.status}-${String(segment.startRatio)}`}
                  tone={segment.status === "PAUSE" ? "pause" : "distract"}
                  startRatio={segment.startRatio}
                  widthRatio={segment.widthRatio}
                />
              ))}
            </span>
            <span className="flex w-full items-center justify-between text-[11px] leading-[13px] text-text-tertiary tabular-nums">
              <span>{startClock}</span>
              <span>{endClock}</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent animated={false} className="pb-3.5">
          <SessionExpansion session={session} />
        </AccordionContent>
      </li>
    </AccordionItem>
  );
}

/** 타임라인 색의 뜻 — 세션 목록 맨 아래에 한 번만 둔다. 항목과 문구는 공부 결과 화면의 범례 그대로다. */
export function SessionTimelineLegend() {
  return (
    <ul className="-mt-1 flex items-start gap-2 pb-3">
      <ResultLegendItem tone="focus" label={LEGEND_COPY.focus} />
      <ResultLegendItem tone="distract" label={LEGEND_COPY.distract} />
      <ResultLegendItem tone="pause" label={LEGEND_COPY.pause} />
    </ul>
  );
}

function SessionExpansion({ session }: { session: StudySessionSummary }) {
  const longest = longestFocusStretch({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    events: session.events ?? [],
  });

  // 세 칸을 같은 폭으로 나누고 가운데에 맞춘다 — 왼쪽 정렬은 값이 짧아 한쪽으로 쏠려 보인다.
  return (
    <dl className="flex items-start gap-2 rounded-[14px] bg-bg-layer-2 px-3.5 py-3">
      <ExpansionStat label="시작 시간" value={formatKstClock(session.startedAt)} />
      <ExpansionStat label="종료 시간" value={formatKstClock(session.endedAt)} />
      <ExpansionStat
        label="최대 집중 시간"
        // 끊기지 않은 구간이 1분에 못 미치면 구간을 내세우지 않고 `1분 미만`으로 적는다.
        value={longest === null ? "1분 미만" : formatDuration(longest.durationSec)}
        valueClassName="text-chart-peak"
        caption={
          longest === null
            ? undefined
            : `${formatKstClock(longest.startedAt)} ~ ${formatKstClock(longest.endedAt)}`
        }
      />
    </dl>
  );
}

function ExpansionStat({
  label,
  value,
  valueClassName = "text-foreground",
  caption,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  caption?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px] text-center">
      <dt className="text-[11px] leading-[13px] text-muted-foreground">{label}</dt>
      <dd className={`text-[15px] leading-[18px] font-bold tabular-nums ${valueClassName}`}>
        {value}
      </dd>
      {caption !== undefined && (
        <dd className="text-[11px] leading-[13px] text-text-tertiary tabular-nums">{caption}</dd>
      )}
    </div>
  );
}
