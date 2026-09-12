/** 카메라 꺼짐/미디어 없음 타일이 공통으로 쓰는 이니셜 아바타. */
export function RoomAvatarFallback({ nickname }: { nickname?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-white/10">
        <span className="text-xl font-bold text-white">{nickname?.charAt(0) ?? ""}</span>
      </div>
    </div>
  );
}
