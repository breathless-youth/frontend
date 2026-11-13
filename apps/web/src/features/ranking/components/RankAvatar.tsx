import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultProfileMascot } from "@/features/profile/DefaultProfileMascot";
import { cn } from "@/lib/utils";

const SIZE = {
  "2xs": "size-6",
  xs: "size-7",
  sm: "size-8",
  "sm-plus": "size-9",
  md: "size-11.5",
  lg: "size-14",
} as const;

/**
 * 순위·멤버 목록 아바타
 *
 * 사진이 있으면 사진을, 없거나 불러오지 못하면 기본 마스코트를 쓴다.
 * 사진이 있으면 바탕색이 가려지므로 내 자리는 목록에서는 줄 바탕, 시상대에서는 아래 닉네임으로 알아본다.
 * 옆에 닉네임이 함께 읽히므로 화면 낭독기에서는 숨긴다.
 */
export function RankAvatar({
  me = false,
  size = "sm",
  imageUrl,
}: {
  me?: boolean;
  size?: keyof typeof SIZE;
  imageUrl?: string | null;
}) {
  return (
    <Avatar
      aria-hidden="true"
      // 테스트용 표시다. 내 바탕색은 사진이 없을 때만 보여 내 자리를 구분한다.
      data-me={me || undefined}
      className={cn(SIZE[size], !me && "bg-chart-heat-1", me && "bg-primary-deep")}
    >
      {imageUrl ? <AvatarImage src={imageUrl} /> : null}
      <AvatarFallback>
        <DefaultProfileMascot />
      </AvatarFallback>
    </Avatar>
  );
}
