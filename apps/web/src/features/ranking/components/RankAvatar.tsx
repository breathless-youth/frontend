import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { firstGrapheme } from "@/lib/graphemes";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "size-8 text-xs",
  md: "size-11.5 text-base",
  lg: "size-14 text-[19px]",
} as const;

/**
 * 닉네임 첫 글자 아바타
 *
 * 사진이 있으면 사진을, 없거나 불러오지 못하면 닉네임 첫 글자를 쓴다.
 * 사진이 있으면 바탕색이 가려지므로 내 자리는 목록에서는 줄 바탕, 시상대에서는 아래 닉네임으로 알아본다.
 * 옆에 닉네임이 함께 읽히므로 화면 낭독기에서는 숨긴다.
 */
export function RankAvatar({
  nickname,
  me = false,
  size = "sm",
  imageUrl,
}: {
  nickname: string;
  me?: boolean;
  size?: keyof typeof SIZE;
  imageUrl?: string | null;
}) {
  const initial = firstGrapheme(nickname) || (Array.from(nickname)[0] ?? "");
  return (
    <Avatar
      aria-hidden="true"
      // 테스트용 표시다. 내 바탕색은 사진이 없을 때만 보여 내 자리를 구분한다.
      data-me={me || undefined}
      className={cn(
        SIZE[size],
        !me && "bg-chart-heat-1 font-bold text-primary",
        me && "font-extrabold",
        me && "bg-primary-deep text-primary-foreground",
      )}
    >
      {imageUrl ? <AvatarImage src={imageUrl} /> : null}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}
