import type { StudySessionSummary } from "@focusmakers/types";

import { longestFocusStretch } from "@/features/study-session/sessionResult";

import { IconChevronDown } from "./icons";
import { durationParts, formatDuration, formatFocusRate, formatKstClock } from "./recordsFormat";
import { type MiniTimelinePiece, miniTimelinePieces } from "./recordsTimetable";

/** 집중률이 이 값 이상이면 필을 진하게 칠한다. */
const HIGH_FOCUS_RATE = 90;

const PIECE_CLASS: Record<MiniTimelinePiece["kind"], string> = {
  // 공부 결과 화면의 타임라인과 같은 색 — 순공 · 자동 멈춤 · 일시정지.
  focus: "bg-primary",
  distract: "bg-state-distract",
  pause: "bg-text-tertiary",
};

type SessionListItemProps = {
  session: StudySessionSummary;
  expanded: boolean;
  onToggle: (session: StudySessionSummary) => void;
};

/**
 * 세션 행
 *
 * 접힌 채로도 순공·총 공부시간·집중률·흐름(미니 타임라인)이 보이고, 탭하면 그 자리에서 행에 없는
 * 것만 펼친다 — 시작 시간 · 종료 시간 · 최대 집중 시간. 한 번에 하나만 펼치는 것은 부모가 맡는다.
 */
export function SessionListItem({ session, expanded, onToggle }: SessionListItemProps) {
  const pieces = miniTimelinePieces(session);
  const startClock = formatKstClock(session.startedAt);
  const endClock = formatKstClock(session.endedAt);
  const highFocus = Math.round(session.focusRate) >= HIGH_FOCUS_RATE;
  const detailId = `session-detail-${String(session.id)}`;

  return (
    <div className={expanded ? "rounded-[14px] bg-bg-layer-2" : undefined}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${startClock}부터 ${endClock}까지, 순공 ${formatDuration(session.focusSec)}, 집중 ${formatFocusRate(session.focusRate)}`}
        onClick={() => onToggle(session)}
        className="flex w-full flex-col gap-2.5 px-[18px] py-[13px] text-left"
      >
        <span className="flex w-full items-center gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-foreground tabular-nums">
              {durationParts(session.focusSec).map((part, index) => (
                <span key={part.unit}>
                  <span className="text-xl leading-6 font-extrabold">
                    {index > 0 ? " " : ""}
                    {part.value}
                  </span>
                  <span className="text-xs leading-6 font-bold text-muted-foreground">
                    {part.unit}
                  </span>
                </span>
              ))}
            </span>
            <span className="text-xs leading-4 text-muted-foreground">
              총 공부시간{" "}
              <span className="font-bold text-foreground tabular-nums">
                {formatDuration(session.studySec)}
              </span>
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-[9px] py-1 text-xs leading-4 font-bold tabular-nums ${
              highFocus
                ? "bg-primary text-primary-foreground"
                : "bg-brand-subtle text-brand-subtle-text"
            }`}
          >
            집중 {formatFocusRate(session.focusRate)}
          </span>
          <span className="flex size-3 shrink-0 items-center justify-center">
            <IconChevronDown className={expanded ? "rotate-180" : undefined} />
          </span>
        </span>

        <span className="flex w-full flex-col gap-[5px]">
          {/* 범례는 두지 않는다 — 색의 뜻은 결과 화면과 같고, 값은 버튼 라벨이 읽어 준다. */}
          <span aria-hidden className="flex h-2 w-full gap-[1.5px] overflow-hidden rounded-xs">
            {pieces.map((piece, index) => (
              <span
                key={`${piece.kind}-${String(index)}`}
                className={`h-full ${PIECE_CLASS[piece.kind]}`}
                style={{ flexGrow: piece.ratio, flexBasis: 0 }}
              />
            ))}
          </span>
          <span className="flex w-full justify-between text-[10.5px] leading-[13px] text-text-tertiary tabular-nums">
            <span>{startClock}</span>
            <span>{endClock}</span>
          </span>
        </span>
      </button>

      {expanded && <SessionExpansion id={detailId} session={session} />}
    </div>
  );
}

function SessionExpansion({ id, session }: { id: string; session: StudySessionSummary }) {
  const longest = longestFocusStretch({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    events: session.events ?? [],
  });

  return (
    <div id={id} className="flex flex-col gap-3 px-[18px] pt-0.5 pb-[13px]">
      <div className="h-px w-full bg-border" />
      <dl className="flex items-center">
        <ExpansionStat label="시작 시간" value={formatKstClock(session.startedAt)} />
        <div className="h-[34px] w-px shrink-0 bg-border" />
        <ExpansionStat label="종료 시간" value={formatKstClock(session.endedAt)} />
        <div className="h-[34px] w-px shrink-0 bg-border" />
        <ExpansionStat
          label="최대 집중 시간"
          value={longest === null ? "—" : formatDuration(longest.durationSec)}
          valueClassName="text-chart-peak"
          caption={
            longest === null
              ? undefined
              : `${formatKstClock(longest.startedAt)} ~ ${formatKstClock(longest.endedAt)}`
          }
        />
      </dl>
    </div>
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
    <div className="flex min-w-0 flex-1 flex-col items-center gap-px">
      <dt className="text-[11px] leading-[14px] text-muted-foreground">{label}</dt>
      <dd className={`text-[17px] leading-[22px] font-extrabold tabular-nums ${valueClassName}`}>
        {value}
      </dd>
      {caption !== undefined && (
        <dd className="text-[10.5px] leading-[13px] text-text-tertiary tabular-nums">{caption}</dd>
      )}
    </div>
  );
}
