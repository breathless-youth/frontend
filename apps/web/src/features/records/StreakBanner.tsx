import { IconCheckSm, IllustFlame } from "./icons";

/**
 * S5 연속 공부 배너(Figma `streak-banner` 65:555 + `Record / Week Dot` 46:101).
 * (`apps/mobile/components/records/StreakBanner.tsx`에서 이식 — BY-330 기록 웹 이관)
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
    // RN의 `accessible + accessibilityLabel`(개별 자식을 숨기고 하나로 묶어 읽는 것)에 대응하는
    // 웹 패턴은 `role="img"` + 요약 `aria-label`이다(`StudyTimelineCard`가 세운 관례와 동일).
    <div
      role="img"
      aria-label={`${day.weekdayLabel}요일, ${
        isToday ? "오늘" : day.state === "done" ? "공부함" : "기록 없음"
      }`}
      className="flex flex-col items-center gap-[5px]"
    >
      {isToday ? (
        <div className="flex size-7 items-center justify-center rounded-full border-2 border-primary bg-background">
          <span className="text-xs leading-[14px] font-bold text-primary">{day.dayOfMonth}</span>
        </div>
      ) : day.state === "done" ? (
        <div className="flex size-7 items-center justify-center rounded-full bg-primary">
          {/* 체크는 장식이 아니라 정보다 — 위 aria-label이 요일과 묶어 전달한다. */}
          <IconCheckSm size={13} />
        </div>
      ) : (
        <div className="size-7 rounded-full bg-bg-layer-2" />
      )}
      <span
        className={
          isToday
            ? "text-[11px] leading-[13px] font-medium text-primary"
            : "text-[11px] leading-[13px] text-text-tertiary"
        }
      >
        {day.weekdayLabel}
      </span>
    </div>
  );
}

export function StreakBanner({ streakDays, days }: StreakBannerProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted p-[18px]">
      <div className="flex flex-row items-center gap-3">
        {/* 공유 일러스트를 재사용하고 S5 실측 크기(38×44)만 props로 넘긴다 — 에셋을 새로 만들지 않는다. */}
        <IllustFlame width={38} height={44} />
        <div className="flex min-w-0 shrink flex-col gap-[3px]">
          <span className="text-[17px] leading-[21px] font-bold text-foreground">
            {streakDays}일 연속 공부 중
          </span>
          <span className="text-[13px] leading-4 text-muted-foreground">
            내일도 10분만 하면 이어져요
          </span>
        </div>
      </div>

      <div className="flex flex-row justify-between">
        {days.map((day) => (
          <WeekDot key={day.dateKey} day={day} />
        ))}
      </div>
    </div>
  );
}
