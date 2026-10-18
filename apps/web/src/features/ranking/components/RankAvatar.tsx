import { firstGrapheme } from "@/lib/graphemes";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "size-8 text-xs",
  md: "size-[46px] text-base",
  lg: "size-14 text-[19px]",
} as const;

/**
 * 닉네임 첫 글자 아바타
 *
 * 다른 사람의 프로필 사진은 오지 않아 첫 글자를 쓴다.
 * 나도 같은 첫 글자를 쓰고 바탕색으로만 구분하며, 파란 줄 위에서는(`onBrand`) 흰 원으로 뒤집는다.
 * 옆에 닉네임이 함께 읽히므로 화면 낭독기에서는 숨긴다.
 */
export function RankAvatar({
  nickname,
  me = false,
  onBrand = false,
  size = "sm",
}: {
  nickname: string;
  me?: boolean;
  onBrand?: boolean;
  size?: keyof typeof SIZE;
}) {
  const initial = firstGrapheme(nickname) || (Array.from(nickname)[0] ?? "");
  return (
    <span
      aria-hidden="true"
      // 테스트용 표시다. 내 아바타도 남과 같이 첫 글자를 쓰므로 바탕색만으로 내 자리를 구분한다.
      data-me={me || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        SIZE[size],
        !me && "bg-chart-heat-1 font-bold text-primary",
        me && "font-extrabold",
        me && !onBrand && "bg-primary-deep text-primary-foreground",
        me && onBrand && "bg-muted text-primary",
      )}
    >
      {initial}
    </span>
  );
}
