import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { firstGrapheme } from "@/lib/graphemes";
import { cn } from "@/lib/utils";

/**
 * 카메라 꺼짐/미디어 없음 타일이 공통으로 쓰는 이니셜 아바타
 *
 * 타일 아래에 닉네임이 따로 보여서 화면 낭독기에서는 숨긴다.
 */
export function RoomAvatarFallback({
  nickname,
  scaleWithTile = false,
}: {
  nickname?: string;
  /** 폭 600 이상 창에서 원과 글자를 타일 폭에 비례시킨다. 1명 전체 화면에서는 끈다. */
  scaleWithTile?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-0 flex items-center justify-center",
        scaleWithTile && "regular:@container",
      )}
    >
      <Avatar className={cn("size-14 bg-white/10", scaleWithTile && "regular:size-[21cqi]")}>
        <AvatarFallback
          className={cn("text-xl font-bold text-white", scaleWithTile && "regular:text-[10cqi]")}
        >
          {firstGrapheme(nickname ?? "")}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
