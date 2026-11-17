import { REPLAY_BLOCKED } from "@/lib/jpegDataUrl";
import { cn } from "@/lib/utils";

import type { PhotoFit } from "./photoFit";

/**
 * 공부 화면 뒤에 까는 사진 배경
 *
 * 사진은 화면을 덮게(cover) 그리고, 넘친 부분 중 조정값의 위치를 보이며 같은 지점을 기준으로 키운다.
 * 이렇게 하면 화면 크기를 재지 않아도 조정값이 미리보기와 실제 화면에서 같은 결과를 낸다.
 */
export function TimerBackgroundLayer({
  src,
  fit,
  className,
}: {
  src: string;
  fit: PhotoFit;
  className?: string;
}) {
  const origin = `${fit.x}% ${fit.y}%`;
  return (
    <div
      aria-hidden="true"
      data-testid="timer-background-layer"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn("size-full object-cover", REPLAY_BLOCKED)}
        style={{
          objectPosition: origin,
          transform: `scale(${fit.scale})`,
          transformOrigin: origin,
        }}
      />
    </div>
  );
}
