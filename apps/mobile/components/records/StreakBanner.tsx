import { Text, View } from "react-native";

import { IconCheckSm, IllustFlame } from "../icons";

/**
 * S5 연속 공부 배너(Figma `streak-banner` 65:555 + `Record / Week Dot` 46:101).
 *
 * Figma에 정의된 도트 상태는 Done·Today 둘뿐이다. 공부하지 않은 지난 날·이번 주의 미래 날은
 * 정의가 없어 빈 원(`bg/layer-2`)으로 최소 방어만 한다 — 임의 디자인이 아니라 자리 표시다.
 * 오늘은 공부 여부와 무관하게 Today 변형(링 + 날짜)으로 그린다(Figma 그대로).
 *
 * 배너 자체는 비인터랙티브다(Figma에 셰브런·핫스팟이 없다 — `SCR-S5-records.md` Interaction Contract).
 */
export type WeekDotState = "done" | "today" | "none";

export type StreakWeekDay = {
  dateKey: string;
  /** 일~토 */
  weekdayLabel: string;
  dayOfMonth: number;
  state: WeekDotState;
};

type StreakBannerProps = {
  /**
   * TODO(SCR-S5-records.md): 백엔드 계약 미확인 — `streakDays` 필드가 `packages/types`에 없다
   * (S1 홈도 동일). 상상 계약을 만들지 않고 props로만 받는다.
   * 연속 공부 0일일 때의 배너 문구도 확정된 것이 없어 같은 템플릿을 그대로 쓴다.
   */
  streakDays: number;
  /**
   * TODO(SCR-S5-records.md): 백엔드 계약 미확인 — 일자별 공부 여부(주간 체크 도트)와 그 판정
   * 기준(기록 1건 이상 vs 순공 10분 이상)이 미확정이고, 월 경계 주는 한 달치 응답만으로 채울 수 없다.
   */
  days: StreakWeekDay[];
};

function WeekDot({ day }: { day: StreakWeekDay }) {
  const isToday = day.state === "today";

  return (
    <View
      accessible
      accessibilityLabel={`${day.weekdayLabel}요일, ${
        isToday ? "오늘" : day.state === "done" ? "공부함" : "기록 없음"
      }`}
      className="items-center gap-[5px]"
    >
      {isToday ? (
        <View className="bg-bg-base dark:bg-bg-base-dark border-brand-primary dark:border-brand-primary-dark size-7 items-center justify-center rounded-full border-2">
          <Text className="text-brand-primary dark:text-brand-primary-dark text-xs font-bold leading-[14px]">
            {day.dayOfMonth}
          </Text>
        </View>
      ) : day.state === "done" ? (
        <View className="bg-brand-primary dark:bg-brand-primary-dark size-7 items-center justify-center rounded-full">
          {/* 체크는 장식이 아니라 정보다 — 위 accessibilityLabel이 요일과 묶어 전달한다. */}
          <IconCheckSm size={13} />
        </View>
      ) : (
        <View className="bg-bg-layer2 dark:bg-bg-layer2-dark size-7 rounded-full" />
      )}
      <Text
        className={
          isToday
            ? "text-brand-primary dark:text-brand-primary-dark text-[11px] font-medium leading-[13px]"
            : "text-text-tertiary text-[11px] leading-[13px]"
        }
      >
        {day.weekdayLabel}
      </Text>
    </View>
  );
}

export function StreakBanner({ streakDays, days }: StreakBannerProps) {
  return (
    <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark gap-4 rounded-[20px] border p-[18px]">
      <View className="flex-row items-center gap-3">
        {/* 공유 일러스트를 재사용하고 S5 실측 크기(38×44)만 props로 넘긴다 — 에셋을 새로 만들지 않는다. */}
        <IllustFlame width={38} height={44} />
        <View className="shrink gap-[3px]">
          <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-[21px]">
            {streakDays}일 연속 공부 중
          </Text>
          <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px] leading-4">
            내일도 10분만 하면 이어져요
          </Text>
        </View>
      </View>

      <View className="flex-row justify-between">
        {days.map((day) => (
          <WeekDot key={day.dateKey} day={day} />
        ))}
      </View>
    </View>
  );
}
