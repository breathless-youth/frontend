import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * 프로필 아바타
 *
 * 사진이 있으면 사진을, 없거나 불러오지 못하면 닉네임 첫 글자(`initial`)를 자동 색(`colorIndex`) 위에 그린다.
 * ⚠️ colorIndex별 팔레트가 디자인에 아직 없다 — 배경을 brand로 통일하고, 팔레트가 확정되면
 * 아래 배열만 채운다(`colorIndex`는 서버가 고정 산출하므로 화면은 인덱싱만 한다).
 */
const AVATAR_COLORS = ["bg-primary"];

export function ProfileAvatar({
  initial,
  colorIndex,
  imageUrl,
}: {
  initial: string;
  colorIndex: number;
  imageUrl?: string | null;
}) {
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <Avatar aria-hidden="true" className={`size-18 ${color}`}>
      {imageUrl ? <AvatarImage src={imageUrl} /> : null}
      <AvatarFallback className="text-[28px] font-bold text-white">{initial}</AvatarFallback>
    </Avatar>
  );
}
