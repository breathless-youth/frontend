/**
 * 월페이퍼 위아래 어둠(v3 시안 28e·30a)
 *
 * 머리 줄과 아래쪽 시간 묶음·하단 바가 읽히게 위아래만 어둡게 하고 가운데 그림은 그대로 둔다.
 */
export function WallpaperScrim() {
  return (
    <div
      aria-hidden="true"
      data-testid="wallpaper-scrim"
      className="pointer-events-none absolute inset-0"
    >
      <div className="absolute inset-x-0 top-0 h-35 bg-[linear-gradient(180deg,rgba(8,10,14,0.6),rgba(8,10,14,0))] landscape-compact:h-30" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[linear-gradient(0deg,rgba(8,10,14,0.88)_0%,rgba(8,10,14,0.6)_50%,rgba(8,10,14,0)_100%)] regular:h-100 landscape-compact:h-55" />
    </div>
  );
}
