import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultProfileMascot } from "@/features/profile/DefaultProfileMascot";
import { cn } from "@/lib/utils";

/**
 * 카메라 꺼짐/미디어 없음 타일이 공통으로 쓰는 아바타
 *
 * 사진이 있으면 사진을, 없거나 불러오지 못하면 기본 마스코트를 그린다.
 * 타일 아래에 닉네임이 따로 보여서 화면 낭독기에서는 숨긴다.
 */
export function RoomAvatarFallback({
  imageUrl,
  scaleWithTile = false,
}: {
  imageUrl?: string | null;
  /** 폭 600 이상 창에서 원을 타일 폭에 비례시킨다. 1명 전체 화면에서는 끈다. */
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
        {imageUrl ? <AvatarImage src={imageUrl} /> : null}
        <AvatarFallback>
          <DefaultProfileMascot />
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
