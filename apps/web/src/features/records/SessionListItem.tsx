import type { StudySessionSummary } from "@focuson/types";

import {
  eventChipItems,
  formatDuration,
  formatFocusRate,
  formatSessionMeta,
} from "./recordsFormat";
import { EventChip } from "./EventChip";
import { IconChevronRight } from "./icons";

/**
 * S5 공부 기록 리스트 아이템(Figma `Record / Session Item` 46:149).
 * (`apps/mobile/components/records/SessionListItem.tsx`에서 이식 — BY-330 기록 웹 이관)
 *
 * **클릭 핸들러를 달지 않는다.** Figma에 셰브런이 있어 이동을 암시하지만 V1.0 화면 인벤토리에
 * "기록 상세"가 없고, S4(공부 결과) 재사용 여부도 미확정이다 — 존재하지 않는 라우트로 이동하지
 * 않도록 비인터랙티브로 둔다(`SCR-S5-records.md` Interaction Contract, Review Checklist).
 * 목적지가 확정되면 이 컴포넌트를 버튼/링크로 감싸고 핸들러만 추가하면 된다.
 *
 * 자정(KST)을 넘긴 세션은 서버가 날짜별로 분할해 저장한다 — 앱에서 다시 합치지 않는다.
 */
type SessionListItemProps = {
  session: StudySessionSummary;
};

export function SessionListItem({ session }: SessionListItemProps) {
  const chips = eventChipItems(session.eventCounts);

  return (
    <div className="flex flex-row items-center justify-between py-2.5">
      {/* min-w-0: RN Flexbox와 달리 웹은 shrink 항목의 기본 min-width가 auto라 넘치는 텍스트가
          줄어들지 않는다 — 0으로 풀어줘야 원본과 같은 축약 동작이 나온다. */}
      <div className="flex min-w-0 shrink flex-col gap-1">
        <span className="text-[17px] leading-5 font-bold text-foreground">
          {formatDuration(session.focusSec)}
        </span>
        <span className="text-[13px] leading-4 text-muted-foreground">
          {formatSessionMeta(session.startedAt, session.endedAt, session.studySec)}
        </span>
        {chips.length > 0 && (
          <div className="flex flex-row flex-wrap gap-1.5 pt-[2px]">
            {chips.map((chip) => (
              <EventChip key={chip.status} status={chip.status} label={chip.label} />
            ))}
          </div>
        )}
      </div>

      {/* 집중률은 그래프가 아니라 숫자 텍스트로 전달한다(수치 정보의 텍스트 병기 규칙) */}
      <div className="flex flex-row items-center gap-2 pl-2">
        <div className="flex flex-col items-end gap-[2px]">
          <span className="text-[11px] leading-[13px] text-text-tertiary">집중률</span>
          <span className="text-xl leading-6 font-bold text-primary">
            {formatFocusRate(session.focusRate)}
          </span>
        </div>
        <IconChevronRight size={12} />
      </div>
    </div>
  );
}
