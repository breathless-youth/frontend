import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import type { RoomJoinPolicy } from "../model/joinPolicy";
import { JoinPolicyChip } from "./JoinPolicyChip";
import { memberCountText } from "../model/limits";
import type { RoomVisibility } from "../model/roomMenu";
import { VISIBILITY_TONE_CLASS, visibilityText } from "../visibility";

/** 그룹 이름 가까이에 붙는 시험·목표 칩. */
export function CategoryTag({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-bg-layer-2 px-1.75 py-px text-[11px] leading-4 font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

/**
 * 그룹 이름 아래의 정보 줄
 *
 * 공개 표시, 시험·목표, 멤버 수를 한 줄에 둔다.
 * 비공개는 칩 색만으로 구분되지 않도록 자물쇠와 글자를 함께 둔다.
 */
export function RoomMeta({
  visibility,
  categoryLabel,
  memberCount,
  joinPolicy,
}: {
  visibility: RoomVisibility;
  categoryLabel: string;
  memberCount: number;
  joinPolicy?: RoomJoinPolicy;
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "flex shrink-0 items-center gap-0.5 rounded-full px-1.75 py-px text-[11px] leading-4 font-semibold",
          VISIBILITY_TONE_CLASS[visibility],
        )}
      >
        {visibility === "private" && <Lock aria-hidden="true" size={10} strokeWidth={2.4} />}
        {visibilityText(visibility)}
      </span>
      <CategoryTag label={categoryLabel} />
      <span className="pl-1 text-[13px] leading-5 text-muted-foreground">
        {memberCountText(memberCount)}
      </span>
      {joinPolicy !== undefined && <JoinPolicyChip policy={joinPolicy} />}
    </div>
  );
}
