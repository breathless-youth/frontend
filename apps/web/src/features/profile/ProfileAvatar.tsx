/**
 * 프로필 아바타 — 닉네임 첫 글자(`initial`) + 자동 색(`colorIndex`)
 * ⚠️ colorIndex별 팔레트가 디자인에 아직 없다 — 배경을 brand로 통일하고, 팔레트가 확정되면
 * 아래 배열만 채운다(`colorIndex`는 서버가 고정 산출하므로 화면은 인덱싱만 한다).
 */
const AVATAR_COLORS = ["bg-primary"];

export function ProfileAvatar({ initial, colorIndex }: { initial: string; colorIndex: number }) {
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <div
      aria-hidden="true"
      className={`flex size-[72px] items-center justify-center rounded-full ${color}`}
    >
      <span className="text-[28px] font-bold text-white">{initial}</span>
    </div>
  );
}
