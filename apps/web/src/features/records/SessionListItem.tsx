import type { StudySessionSummary } from "@focusmakers/types";

import { formatSessionSubline, formatSessionTimeRange } from "./recordsFormat";
import { IconChevronRight } from "./icons";

/**
 * 세션 행
 *
 * onSelect가 있을 때만 버튼이 된다 — 후속 티켓이 상세 열기를 붙이며 버튼으로 승격한다. 그
 * 전에는 비인터랙티브 행이라 키보드 포커스를 받지 않는다.
 */
type SessionListItemProps = {
  session: StudySessionSummary;
  onSelect?: (session: StudySessionSummary) => void;
};

const rowClassName = "flex w-full min-h-11 items-center gap-3 py-3 text-left";

export function SessionListItem({ session, onSelect }: SessionListItemProps) {
  const content = (
    <>
      <span className="size-2 shrink-0 rounded-xs bg-primary" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] leading-[17px] font-bold text-foreground tabular-nums">
          {formatSessionTimeRange(session.startedAt, session.endedAt)}
        </span>
        <span className="text-xs leading-[15px] text-muted-foreground">
          {formatSessionSubline(session.focusSec, session.focusRate)}
        </span>
      </span>
      <IconChevronRight size={13} color="var(--color-text-tertiary)" />
    </>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(session)} className={rowClassName}>
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
