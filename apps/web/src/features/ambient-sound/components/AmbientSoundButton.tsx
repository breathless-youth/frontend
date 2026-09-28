import { forwardRef } from "react";
import { Music } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AmbientSoundButtonProps {
  /** 켜진 소리 여부 */
  on: boolean;
  /** 시트 개폐 상태 */
  expanded: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * 세션 화면 우상단의 배경음 진입 버튼. 색·반경·흐림은 컨트롤 바 버튼과 같은 값이고
 * 지름만 가로 컨트롤 바 치수(44)다. 아이콘은 Figma 자산이 없어 lucide 음표를 자리 표시로 둔다. 켜짐 여부는 색으로 보인다.
 *
 * 세션 레이어가 `pointer-events-none` 이라 클릭을 받으려면 스스로 `pointer-events-auto` 여야 한다.
 */
export const AmbientSoundButton = forwardRef<HTMLButtonElement, AmbientSoundButtonProps>(
  function AmbientSoundButton({ on, expanded, onClick, className }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        // 이 버튼은 소리를 켜고 끄지 않고 시트를 연다. aria-pressed 를 달면 보조기기에 토글로
        // 읽혀 실제 동작과 어긋난다. 재생 여부는 이름으로 전한다.
        aria-label={on ? "배경음 켜짐" : "배경음"}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        data-on={on}
        onClick={onClick}
        className={cn(
          "pointer-events-auto flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/12 text-white backdrop-blur-[7px]",
          "transition-[transform,opacity] duration-200 active:scale-90 active:opacity-80 motion-reduce:transition-none",
          "data-[on=true]:text-[var(--state-focus)]",
          className,
        )}
      >
        <Music size={20} aria-hidden="true" />
      </button>
    );
  },
);
