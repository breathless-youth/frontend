import type { MedalRank } from "@focusmakers/types";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

import { IllustMedal } from "../icons";
import { CHIP_CLASS } from "./BoardSwitcher";

export type RankChip = "all" | MedalRank;

const CHIPS: readonly RankChip[] = ["all", 1, 2, 3];

/**
 * 전체·1위·2위·3위 칩
 *
 * 랭킹 기록 시트와 모두 보기가 같이 쓴다.
 * 시트 파일과 나눠 두어 모두 보기 화면이 시트 코드(Base UI)까지 받지 않게 한다.
 * 앱 부품은 페이지 스크롤만 따라가서 시트 안에서는 등록하지 않고, 페이지에서만 `nativeControlId`를 넘긴다.
 */
export function RankChips({
  value,
  onChange,
  nativeControlId,
  className,
}: {
  value: RankChip;
  onChange: (value: RankChip) => void;
  nativeControlId?: string;
  className?: string;
}) {
  const { ref } = useNativeControl<HTMLDivElement>(
    nativeControlId === undefined
      ? null
      : {
          id: nativeControlId,
          kind: "segment",
          labels: CHIPS.map((chip) => (chip === "all" ? "전체" : `${chip}위`)),
          selected: CHIPS.indexOf(value),
          disabled: CHIPS.map(() => false),
          accessibilityLabel: "순위",
        },
    (index) => {
      const chip = CHIPS[index];
      if (chip !== undefined && chip !== value) {
        onChange(chip);
      }
    },
  );
  return (
    <ToggleGroup
      ref={ref}
      type="single"
      aria-label="순위"
      value={String(value)}
      onValueChange={(next) => {
        if (next === "" || next === String(value)) {
          return;
        }
        onChange(next === "all" ? "all" : (Number(next) as MedalRank));
      }}
      className={cn("flex-nowrap gap-1.5", className)}
    >
      <ToggleGroupItem value="all" className={CHIP_CLASS}>
        전체
      </ToggleGroupItem>
      {([1, 2, 3] as const).map((rank) => (
        <ToggleGroupItem key={rank} value={String(rank)} className={cn(CHIP_CLASS, "gap-1.5 pl-3")}>
          <IllustMedal rank={rank} size={14} />
          {rank}위
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
