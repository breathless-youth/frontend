import { TIME_SLOTS, type RankingType, type TimeSlot } from "@focusmakers/types";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SegmentedControl } from "@/features/records/SegmentedControl";
import { cn } from "@/lib/utils";

import {
  HALL_BOARD_TYPES,
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
 * 종목·기간 칸
 *
 * 줄 높이를 줄여 칸이 28px이 되므로 누르는 영역을 넓혀 44px로 맞춘다.
 * 넓히는 방향은 이웃 칸의 누르는 영역과 겹치지 않게 쓰는 곳에서 정한다.
 */
const SEGMENT_TRIGGER_CLASS = "flex-1 justify-center text-xs leading-3.5 font-bold";

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
 * 랭킹 쪽은 종목과 기간 세그먼트를 폭에 맞춰 차례로 두고, 시간대면 그 아래에 구간 칸 5개를 둔다.
 * 명예의 전당 쪽은 종목 세그먼트만 둔다.
 * 앱 세그먼트의 누름은 웹을 거쳐 늦게 도착할 수 있어서, 이미 고른 종목과 같은 값이 오면 시간대에서 고른 구간이 풀리지 않게 무시한다.
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
      <SegmentedControl
        ariaLabel="종목"
        value={selection.type}
        options={types.map((value) => ({ value, label: TYPE_LABEL[value] }))}
        onChange={(next) => {
          if (next !== selection.type) {
            onChange(selectType(selection, next));
          }
        }}
        // 대문자와 밑줄이 섞인 종목 값으로는 앱이 받는 id를 만들 수 없다.
        nativeControlId="segment-ranking-type"
        className="w-full"
        // 위 큰 글자 탭에서는 멀고 아래 기간 칸과는 가까워 위로 12px, 아래로 4px 넓힌다.
        triggerClassName={cn(SEGMENT_TRIGGER_CLASS, "before:-top-3 before:-bottom-1")}
      />
      {period !== null && (
        <SegmentedControl
          ariaLabel="기간"
          value={period}
          options={periods.map((value) => ({ value, label: PERIOD_LABEL[value] }))}
          onChange={(next) => onChange(selectPeriod(selection, next))}
          className="w-full"
          // 위 종목 칸의 누르는 영역에 닿지 않게 위로는 4px, 아래로는 12px 넓힌다.
          triggerClassName={cn(SEGMENT_TRIGGER_CLASS, "before:-top-1 before:-bottom-3")}
        />
      )}
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
          className="grid grid-cols-5 gap-1.5"
        >
          {/* 누르는 영역은 위로 넓히면 기간 칸의 영역에 닿아, 시상대 쪽 틈으로만 4px 넓혀 44px로 맞춘다. */}
          {TIME_SLOTS.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={`${SLOT_LABEL[value]} ${SLOT_HOURS[value]}${value === nowSlot ? ", 지금 구간" : ""}`}
              className="group h-10 flex-col justify-center gap-0.5 rounded-md border-0 bg-muted px-0 text-muted-foreground before:top-0 before:-bottom-1 data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              <span className="flex items-center gap-1 text-[13px] leading-3.75 font-semibold group-data-[state=on]:font-bold">
                {value === nowSlot && (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-feedback-success" />
                )}
                {SLOT_LABEL[value]}
              </span>
              <span className="text-[10px] leading-3 text-text-tertiary">{SLOT_HOURS[value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
