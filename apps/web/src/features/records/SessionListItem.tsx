import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";

import {
  ResultBarSegment,
  ResultLegendItem,
} from "@/features/study-session/components/ResultCardParts";
import { longestFocusStretch, timelineSegments } from "@/features/study-session/sessionResult";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { isManualSession, readAloudLabel, spanOf } from "@/features/manual-record/manualRecord";
import { cn } from "@/lib/utils";

import { IconChevronDown } from "./icons";
import { durationParts, formatDuration, formatFocusRate, formatIsoClock } from "./recordsFormat";
import { Badge } from "@/components/ui/badge";
import { recordDisplayKey, type RecordsSession } from "./recordsSession";

type SessionListItemProps<T extends RecordsSession = RecordsSession> = {
  session: T;
  /** 목록 안에서의 구분선 등 — 줄(`li`)에 붙는다. */
  className?: string;
  /** 수동 기록의 과목 이름. 측정 세션 행은 쓰지 않는다. */
  subjectName?: string;
  /** 기록 펼침의 `수정`. 토큰 없는 문서는 버튼을 두지 않는다. */
  onEdit?: (session: T) => void;
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
export function SessionListItem<T extends RecordsSession>({
  session,
  className,
  subjectName,
  onEdit,
}: SessionListItemProps<T>) {
  const { t } = useTranslation(["records", "manual-record"]);
  if (isManualSession(session)) {
    return (
      <ManualSessionListItem
        session={session}
        className={className}
        subjectName={subjectName ?? t("manual-record:subject.none")}
        onEdit={onEdit}
      />
    );
  }
  const startClock = formatIsoClock(session.startedAt);
  const endClock = formatIsoClock(session.endedAt);

  // 공부 결과 화면의 타임라인과 같은 계산·같은 조각이다 — 순공색 바탕 위에 순공이 아닌 구간만 얹는다.
  const segments = timelineSegments({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    events: session.events ?? [],
  });

  return (
    <AccordionItem
      value={recordDisplayKey(session)}
      asChild
      className={cn("border-b-0", className)}
    >
      <li>
        <AccordionTrigger
          // 꺾쇠는 집중률 알약 옆 제자리에 따로 둔다.
          hideChevron
          aria-label={t("sessionItem.aria.summary", {
            start: startClock,
            end: endClock,
            focus: formatDuration(session.focusSec),
            rate: formatFocusRate(session.focusRate),
          })}
          className="group flex-col items-stretch gap-2.5 py-3.5 font-normal"
        >
          <span className="flex w-full items-start justify-between">
            <span className="flex min-w-0 flex-col gap-0.75">
              <FocusDuration focusSec={session.focusSec} />
              <span className="text-[13px] leading-4 text-muted-foreground tabular-nums">
                {t("headline.total", { duration: formatDuration(session.studySec) })}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 pt-0.5">
              <RecordEditedIndicator session={session} />
              <Badge className="h-6 px-2.25 py-0 text-xs leading-4 font-semibold">
                {t("sessionItem.focusRate", { rate: formatFocusRate(session.focusRate) })}
              </Badge>
              <IconChevronDown size={10} className="group-data-[state=open]:rotate-180" />
            </span>
          </span>

          <span className="flex w-full flex-col gap-1.25">
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
            <span className="flex w-full items-center justify-between text-[11px] leading-3.25 text-text-tertiary tabular-nums">
              <span>{startClock}</span>
              <span>{endClock}</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent animated={false} className="pb-3.5">
          <SessionExpansion session={session} />
          <RecordEditButton session={session} onEdit={onEdit} />
        </AccordionContent>
      </li>
    </AccordionItem>
  );
}

function RecordEditedIndicator({ session }: { session: RecordsSession }) {
  const { t } = useTranslation("planner");
  return "edited" in session && session.edited ? (
    <Pencil
      size={12}
      role="img"
      aria-label={t("record.edited")}
      className="shrink-0 text-muted-foreground"
    />
  ) : null;
}

function RecordEditButton<T extends RecordsSession>({
  session,
  onEdit,
}: Pick<SessionListItemProps<T>, "session" | "onEdit">) {
  const { t } = useTranslation("records");
  return onEdit ? (
    <div className="flex justify-end pt-2">
      <Button
        variant="link"
        onClick={() => onEdit(session)}
        className="h-11 px-4 text-[15px] leading-4.75"
      >
        {t("manualItem.edit")}
      </Button>
    </div>
  ) : null;
}

/** 타임라인 색의 뜻 — 세션 목록 맨 아래에 한 번만 둔다. 항목과 문구는 공부 결과 화면의 범례 그대로다. */
export function SessionTimelineLegend() {
  const { t } = useTranslation("study-session");
  return (
    <ul className="-mt-1 flex flex-wrap items-start gap-2 pb-3">
      <ResultLegendItem tone="focus" label={t("legend.focus")} />
      <ResultLegendItem tone="distract" label={t("legend.distract")} />
      <ResultLegendItem tone="pause" label={t("legend.pause")} />
    </ul>
  );
}

function SessionExpansion({ session }: { session: RecordsSession }) {
  const { t } = useTranslation("records");
  const longest = longestFocusStretch({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    events: session.events ?? [],
  });

  // 세 칸을 같은 폭으로 나누고 가운데에 맞춘다 — 왼쪽 정렬은 값이 짧아 한쪽으로 쏠려 보인다.
  return (
    <dl className="flex items-start gap-2 rounded-[14px] bg-bg-layer-2 px-3.5 py-3">
      <ExpansionStat label={t("sessionItem.startTime")} value={formatIsoClock(session.startedAt)} />
      <ExpansionStat label={t("sessionItem.endTime")} value={formatIsoClock(session.endedAt)} />
      <ExpansionStat
        label={t("sessionItem.longestFocus")}
        // 1초 이상 끊기지 않은 구간이 없으면 구간을 내세우지 않고 `1초 미만`으로 적는다.
        value={
          longest === null ? t("sessionItem.underSecond") : formatDuration(longest.durationSec)
        }
        valueClassName="text-chart-peak"
        caption={
          longest === null
            ? undefined
            : `${formatIsoClock(longest.startedAt)} ~ ${formatIsoClock(longest.endedAt)}`
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
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.75 text-center">
      <dt className="text-[11px] leading-3.25 text-muted-foreground">{label}</dt>
      <dd className={`text-[15px] leading-4.5 font-bold tabular-nums ${valueClassName}`}>
        {value}
      </dd>
      {caption !== undefined && (
        <dd className="text-[11px] leading-3.25 text-text-tertiary tabular-nums">{caption}</dd>
      )}
    </div>
  );
}

/** 순공을 숫자는 크게, 단위는 작게 적는다. */
function FocusDuration({ focusSec }: { focusSec: number }) {
  return (
    <span className="flex items-baseline gap-1.5 pr-1 text-foreground tabular-nums">
      {durationParts(focusSec).map((part, index) => (
        <span key={part.unit} className="flex items-baseline gap-px">
          {index > 0 ? " " : ""}
          <span className="text-[22px] leading-6.5 font-extrabold">{part.value}</span>
          <span className="text-[13px] leading-4 font-bold">{part.unit}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * 수동 기록 행
 *
 * 수동 기록은 전부 순공이라 순공 = 총이어서 `총 N` 줄을 두지 않고, 집중률 자리에 `직접 입력` 배지를 둔다.
 * 미니 타임라인은 전체를 순공색으로 칠하고, 펼치면 최대 집중 대신 과목을 보여 준다.
 * 자정에서 나뉜 조각도 각각 한 행이며, 문자열 표시 키는 실제 원본 세션 ID와 구분한다.
 */
function ManualSessionListItem<T extends RecordsSession>({
  session,
  className,
  subjectName,
  onEdit,
}: {
  session: T;
  className?: string;
  subjectName: string;
  onEdit?: (session: T) => void;
}) {
  const { t } = useTranslation("records");
  const startClock = formatIsoClock(session.startedAt);
  const endClock = formatIsoClock(session.endedAt);

  return (
    <AccordionItem
      value={recordDisplayKey(session)}
      asChild
      className={cn("border-b-0", className)}
    >
      <li>
        <AccordionTrigger
          hideChevron
          aria-label={readAloudLabel({ subjectName, span: spanOf(session) })}
          className="group flex-col items-stretch gap-2.5 py-3.5 font-normal"
        >
          <span className="flex w-full items-start justify-between">
            <FocusDuration focusSec={session.focusSec} />
            <span className="flex shrink-0 items-center gap-2 pt-0.5">
              <RecordEditedIndicator session={session} />
              <Badge variant="neutral" className="h-6 px-2.25 py-0 text-xs leading-4 font-semibold">
                {t("manualItem.badge")}
              </Badge>
              <IconChevronDown size={10} className="group-data-[state=open]:rotate-180" />
            </span>
          </span>
          <span className="flex w-full flex-col gap-1.25">
            <span aria-hidden className="block h-2 w-full rounded-full bg-primary" />
            <span className="flex w-full items-center justify-between text-[11px] leading-3.25 text-text-tertiary tabular-nums">
              <span>{startClock}</span>
              <span>{endClock}</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent animated={false} className="pb-3.5">
          <dl className="flex items-start gap-2 rounded-[14px] bg-bg-layer-2 px-3.5 py-3">
            <ExpansionStat label={t("manualItem.start")} value={startClock} />
            <ExpansionStat label={t("manualItem.end")} value={endClock} />
            <ExpansionStat label={t("manualItem.subject")} value={subjectName} />
          </dl>
          <RecordEditButton session={session} onEdit={onEdit} />
        </AccordionContent>
      </li>
    </AccordionItem>
  );
}
