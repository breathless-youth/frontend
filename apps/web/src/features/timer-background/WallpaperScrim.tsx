import { cn } from "@/lib/utils";

/**
 * 월페이퍼 위아래 어둠(v3 시안 28e·30a)
 *
 * 머리 줄과 아래쪽 시간 묶음·하단 바가 읽히게 위아래만 어둡게 하고 가운데 그림은 그대로 둔다.
 * 심플 모드는 카메라 창과 하단 칩이 없어 배경이 더 밝게 보이도록 띠를 짧고 옅게 한다.
 * 시간 묶음이 왼쪽 아래에 있어 아래 띠는 글자가 읽힐 만큼 남긴다.
 */
export function WallpaperScrim({ simple }: { simple: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-testid="wallpaper-scrim"
      className="pointer-events-none absolute inset-0"
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0",
          simple
            ? "h-24 bg-[linear-gradient(180deg,rgba(8,10,14,0.45),rgba(8,10,14,0))] landscape-compact:h-20"
            : "h-35 bg-[linear-gradient(180deg,rgba(8,10,14,0.6),rgba(8,10,14,0))] landscape-compact:h-30",
        )}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0",
          simple
            ? "h-56 bg-[linear-gradient(0deg,rgba(8,10,14,0.75)_0%,rgba(8,10,14,0.4)_50%,rgba(8,10,14,0)_100%)] regular:h-72 landscape-compact:h-40"
            : "h-80 bg-[linear-gradient(0deg,rgba(8,10,14,0.88)_0%,rgba(8,10,14,0.6)_50%,rgba(8,10,14,0)_100%)] regular:h-100 landscape-compact:h-55",
        )}
      />
    </div>
  );
}
