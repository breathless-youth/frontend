import type { MedalRank } from "@focusmakers/types";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { IllustMedal } from "../icons";
import { CHIP_CLASS } from "./BoardSwitcher";

export type RankChip = "all" | MedalRank;

/**
 * 전체·1위·2위·3위 칩
 *
 * 랭킹 기록 시트와 모두 보기가 같이 쓴다.
 * 시트 파일과 나눠 두어 모두 보기 화면이 시트 코드(Base UI)까지 받지 않게 한다.
 */
export function RankChips({
  value,
  onChange,
  className,
}: {
  value: RankChip;
  onChange: (value: RankChip) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
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
