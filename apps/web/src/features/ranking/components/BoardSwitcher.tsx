import type { RankingType, TimeSlot } from "@focusmakers/types";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegmentedControl } from "@/features/records/SegmentedControl";
import { cn } from "@/lib/utils";

import {
  HALL_BOARD_TYPES,
  LIVE_SLOTS,
  PERIOD_LABEL,
  RANKING_BOARD_TYPES,
  SLOT_HOURS,
  SLOT_LABEL,
  TYPE_LABEL,
  modeOf,
  periodOf,
  periodsOf,
  selectPeriod,
  selectSlot,
  selectType,
  slotOf,
  type BoardMode,
  type BoardSelection,
} from "../model/board";

/**
 * 순위 칩
 *
 * 기본 칩 모양(테두리 알약)을 시안의 흰 칩과 진한 파란 선택 칩으로 덮어쓴다.
 * 시안처럼 테두리 없이 채움만으로 선택을 나눈다.
 * 누르는 영역은 위아래 6.5px씩 넓혀 44px로 맞춘다.
 */
export const CHIP_CLASS =
  "h-7.75 min-w-11 justify-center rounded-full border-0 bg-muted px-2.5 text-[13px] leading-3.75 font-semibold text-muted-foreground before:inset-y-[-6.5px] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-muted " +
  "data-[state=on]:bg-primary-deep data-[state=on]:font-bold data-[state=on]:text-primary-foreground";

/**
 * 큰 글자 탭
 *
 * 보이는 높이는 글자 줄 높이 29px이고, 누르는 영역은 위로만 넓혀 44px로 맞춘다.
 * 12px 아래에 종목 칸이 있어 아래로 넓히면 그 누르는 영역과 겹친다.
 */
const MODE_TRIGGER_CLASS =
  "relative mb-0 h-7.25 min-h-0 min-w-11 border-b-0 px-0 text-2xl leading-7.25 font-extrabold tracking-[-0.7px] text-text-tertiary " +
  "before:absolute before:inset-x-0 before:-top-3.75 before:bottom-0 before:content-[''] " +
  "data-[state=active]:text-foreground";

/**
 * 종목 탭
 *
 * 큰 글자 탭보다 작은 밑줄 탭이고, 칸 높이가 44px이라 누르는 영역을 따로 넓히지 않는다.
 */
const TYPE_TRIGGER_CLASS =
  "relative mb-0 border-b-0 px-0 text-[17px] leading-5.5 font-bold text-text-tertiary " +
  "after:absolute after:inset-x-0 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:content-[''] " +
  "data-[state=active]:text-foreground data-[state=active]:after:opacity-100";

/**
 * 기간 칸
 *
 * 종목 탭 오른쪽에 붙는 세그먼트라 칸 높이가 32px이다.
 * 누르는 영역은 위아래로 6px씩 넓혀 44px로 맞추고, 그 범위는 종목 줄 높이 안에 들어간다.
 * 폭 360px 미만에서는 순공의 기간 셋과 종목 탭이 한 줄에 들어가도록 좌우 여백과 글자를 줄인다.
 */
const PERIOD_TRIGGER_CLASS =
  "rounded-[9px] px-3.5 py-2 text-sm leading-4 before:-top-1.5 before:-bottom-1.5 max-[359px]:px-2 max-[359px]:text-[13px]";

/**
 * 랭킹과 명예의 전당 고르기
 *
 * 큰 글자 탭이다.
 * 아래 내용은 탭 패널로 감싸지 않아, Radix가 붙이는 `aria-controls`가 없는 요소를 가리키지 않게 뺀다.
 */
export function BoardModeTabs({
  value,
  onChange,
}: {
  value: BoardMode;
  onChange: (mode: BoardMode) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as BoardMode)}>
      <TabsList aria-label="랭킹 종류" className="gap-2 border-b-0">
        <TabsTrigger value="ranking" aria-controls={undefined} className={MODE_TRIGGER_CLASS}>
          랭킹
        </TabsTrigger>
        <TabsTrigger value="hall" aria-controls={undefined} className={MODE_TRIGGER_CLASS}>
          명예의 전당
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/**
 * 판 고르기
 *
 * 한 줄에 왼쪽은 종목 밑줄 탭, 오른쪽은 기간 칸을 두고, 시간대면 그 아래에 구간 칸 4개를 둔다.
 * 명예의 전당 쪽은 기간이 없어 종목 탭만 둔다.
 * 선택된 구간 칸을 다시 누르면 ToggleGroup이 빈 값을 주는데, 판은 늘 하나가 골라져 있어야 해서 무시한다.
 * 지금 구간으로 연 시간대 판은 서버가 고른 구간을 선택으로 보인다.
 */
export function BoardSwitcher({
  selection,
  resolvedSlot,
  nowSlot,
  onChange,
  className,
}: {
  selection: BoardSelection;
  resolvedSlot: TimeSlot | null;
  nowSlot: TimeSlot;
  onChange: (next: BoardSelection) => void;
  className?: string;
}) {
  const types: readonly RankingType[] =
    modeOf(selection) === "hall" ? HALL_BOARD_TYPES : RANKING_BOARD_TYPES;
  const periods = periodsOf(selection.type);
  const period = periodOf(selection);
  const slot = slotOf(selection) ?? resolvedSlot ?? nowSlot;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Tabs
          value={selection.type}
          onValueChange={(next) => onChange(selectType(selection, next as RankingType))}
        >
          <TabsList aria-label="종목" className="gap-3 border-b-0">
            {types.map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                aria-controls={undefined}
                className={TYPE_TRIGGER_CLASS}
              >
                {TYPE_LABEL[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {period !== null && (
          <SegmentedControl
            ariaLabel="기간"
            value={period}
            options={periods.map((value) => ({ value, label: PERIOD_LABEL[value] }))}
            onChange={(next) => onChange(selectPeriod(selection, next))}
            className="shrink-0 rounded-[11px] p-0.5"
            triggerClassName={PERIOD_TRIGGER_CLASS}
          />
        )}
      </div>
      {selection.type === "TIME_SLOT" && (
        <ToggleGroup
          type="single"
          aria-label="시간대 구간"
          value={slot}
          onValueChange={(next) => {
            if (next !== "" && next !== slot) {
              onChange(selectSlot(selection, next as TimeSlot));
            }
          }}
          className="grid grid-cols-4 gap-1.5"
        >
          {/* 누르는 영역은 위아래로 6px씩 넓혀 44px로 맞춘다. */}
          {LIVE_SLOTS.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={`${SLOT_LABEL[value]} ${SLOT_HOURS[value]}${value === nowSlot ? ", 지금 구간" : ""}`}
              className="h-8 justify-center rounded-md border-0 bg-bg-control-track px-0 text-[13px] leading-3.75 font-semibold text-muted-foreground before:-inset-y-1.5 data-[state=on]:bg-muted data-[state=on]:font-bold data-[state=on]:text-foreground data-[state=on]:shadow-(--shadow-segment-thumb)"
            >
              {SLOT_LABEL[value]}
              {/* 앱 아이콘의 알림 배지처럼 칸 오른쪽 위 모서리에 걸친다. */}
              {value === nowSlot && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 size-2.5 rounded-full bg-feedback-success ring-2 ring-(--bg-soft-blue-start)"
                />
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
