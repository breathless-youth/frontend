import type { StudySessionSummary } from "@focusmakers/types";
import { Text, View } from "react-native";

import {
  eventChipItems,
  formatDuration,
  formatFocusRate,
  formatSessionMeta,
} from "../../lib/recordsFormat";
import { IconChevronRight } from "../icons";
import { EventChip } from "./EventChip";

/**
 * S5 공부 기록 리스트 아이템(Figma `Record / Session Item` 46:149).
 *
 * **탭 핸들러를 달지 않는다.** Figma에 셰브런이 있어 이동을 암시하지만 V1.0 화면 인벤토리에
 * "기록 상세"가 없고, S4(공부 결과) 재사용 여부도 미확정이다 — 존재하지 않는 라우트로 이동하지
 * 않도록 비인터랙티브로 둔다(`SCR-S5-records.md` Interaction Contract, Review Checklist).
 * 목적지가 확정되면 이 컴포넌트를 `Pressable`로 감싸고 `onPress`만 추가하면 된다.
 *
 * 자정(KST)을 넘긴 세션은 서버가 날짜별로 분할해 저장한다 — 앱에서 다시 합치지 않는다.
 */
type SessionListItemProps = {
  session: StudySessionSummary;
};

export function SessionListItem({ session }: SessionListItemProps) {
  const chips = eventChipItems(session.eventCounts);

  return (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="shrink gap-1">
        <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-5">
          {formatDuration(session.focusSec)}
        </Text>
        <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px] leading-4">
          {formatSessionMeta(session.startedAt, session.endedAt, session.studySec)}
        </Text>
        {chips.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 pt-[2px]">
            {chips.map((chip) => (
              <EventChip key={chip.status} status={chip.status} label={chip.label} />
            ))}
          </View>
        )}
      </View>

      {/* 집중률은 그래프가 아니라 숫자 텍스트로 전달한다(수치 정보의 텍스트 병기 규칙) */}
      <View className="flex-row items-center gap-2 pl-2">
        <View className="items-end gap-[2px]">
          <Text className="text-text-tertiary text-[11px] leading-[13px]">집중률</Text>
          <Text className="text-brand-primary dark:text-brand-primary-dark text-xl font-bold leading-6">
            {formatFocusRate(session.focusRate)}
          </Text>
        </View>
        <IconChevronRight size={12} />
      </View>
    </View>
  );
}
