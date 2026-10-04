import type { StudySessionSummary } from "@focusmakers/types";

import { longestFocusStretch } from "@/features/study-session/sessionResult";

import { IconChevronDown } from "./icons";
import { durationParts, formatDuration, formatFocusRate, formatKstClock } from "./recordsFormat";
import { type MiniTimelinePiece, miniTimelinePieces } from "./recordsTimetable";

/** 타임라인 바는 순공색이 바탕이고, 그 위에 순공이 아닌 구간만 덧칠한다. */
const OVERLAY_CLASS: Record<Exclude<MiniTimelinePiece["kind"], "focus">, string> = {
  distract: "bg-state-distract",
  pause: "bg-state-pause",
};

/** 순공이 아닌 조각만 뽑아 바 위의 위치(비율)를 붙인다 — 시작 위치는 앞 조각들의 비율을 더한 값이다. */
function timelineOverlays(pieces: readonly MiniTimelinePiece[]) {
  const overlays: { kind: "distract" | "pause"; left: number; width: number }[] = [];
  let cursor = 0;
  for (const piece of pieces) {
    if (piece.kind !== "focus") {
      overlays.push({ kind: piece.kind, left: cursor, width: piece.ratio });
    }
    cursor += piece.ratio;
  }
  return overlays;
}

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
 * 타임라인 색의 뜻은 목록 맨 아래의 범례(`SessionTimelineLegend`)가 한 번 알려 준다.
 */
export function SessionListItem({ session, expanded, onToggle }: SessionListItemProps) {
  const startClock = formatKstClock(session.startedAt);
  const endClock = formatKstClock(session.endedAt);
  const detailId = `session-detail-${String(session.id)}`;

  const overlays = timelineOverlays(miniTimelinePieces(session));

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${startClock}부터 ${endClock}까지, 순공 ${formatDuration(session.focusSec)}, 집중 ${formatFocusRate(session.focusRate)}`}
        onClick={() => onToggle(session)}
        className="flex w-full flex-col gap-2.5 py-3.5 text-left"
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
            <span className="flex h-6 items-center rounded-full bg-brand-subtle px-[9px] text-xs leading-4 font-semibold text-brand-subtle-text tabular-nums">
              집중 {formatFocusRate(session.focusRate)}
            </span>
            <IconChevronDown size={10} className={expanded ? "rotate-180" : undefined} />
          </span>
        </span>

        <span className="flex w-full flex-col gap-[5px]">
          <span
            aria-hidden
            className="relative block h-2 w-full overflow-hidden rounded-full bg-primary"
          >
            {overlays.map((overlay, index) => (
              <span
                key={`${overlay.kind}-${String(index)}`}
                data-kind={overlay.kind}
                className={`absolute inset-y-0 ${OVERLAY_CLASS[overlay.kind]}`}
                style={{
                  left: `${String(overlay.left * 100)}%`,
                  width: `${String(overlay.width * 100)}%`,
                }}
              />
            ))}
          </span>
          <span className="flex w-full items-center justify-between text-[11px] leading-[13px] text-text-tertiary tabular-nums">
            <span>{startClock}</span>
            <span>{endClock}</span>
          </span>
        </span>
      </button>

      {expanded && <SessionExpansion id={detailId} session={session} />}
    </div>
  );
}

/** 타임라인 색의 뜻 — 세션 목록 맨 아래에 한 번만 둔다. */
export function SessionTimelineLegend() {
  return (
    <ul className="-mt-1 flex items-start gap-2 pb-3">
      {[
        { label: "순공", dot: "bg-primary" },
        { label: "자동 멈춤", dot: "bg-state-distract" },
        { label: "일시정지", dot: "bg-state-pause" },
      ].map((item) => (
        <li key={item.label} className="flex items-center gap-1">
          <span aria-hidden className={`size-1.5 rounded-full ${item.dot}`} />
          <span className="text-[11px] leading-[13px] text-muted-foreground">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function SessionExpansion({ id, session }: { id: string; session: StudySessionSummary }) {
  const longest = longestFocusStretch({
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    events: session.events ?? [],
  });

  return (
    <div id={id} className="pb-3.5">
      {/* 세 칸을 같은 폭으로 나누고 가운데에 맞춘다 — 왼쪽 정렬은 값이 짧아 한쪽으로 쏠려 보인다. */}
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
