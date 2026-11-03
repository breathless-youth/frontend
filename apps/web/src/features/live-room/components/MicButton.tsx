import { Mic, MicOff } from "lucide-react";

import { SESSION_SYMBOL_SCALE } from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

import { playPressPop } from "./playPressPop";
import { roomBarButtonClassName, roomBarDangerButtonClassName } from "./RoomControlBar";

/**
 * 그룹 공부방 바의 마이크 버튼
 *
 * 꺼짐은 카메라 꺼짐과 같은 반투명 빨강이라 지금 소리가 나가지 않는다는 것이 한눈에 보인다.
 * 앱 유리 버튼도 같은 색 역할을 받아 꺼짐이면 경고 색이다.
 * 아이콘은 Figma 자산이 없어 lucide 마이크를 자리 표시로 둔다.
 */
export function MicButton({
  on,
  disabled = false,
  inactive = false,
  hidden = false,
  onToggle,
}: {
  on: boolean;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금 */
  disabled?: boolean;
  /** 버튼을 보인 채 앱 버튼의 누름만 막는 잠금 */
  inactive?: boolean;
  /** 바가 숨으면 앱 버튼을 흐리게 감춘다. */
  hidden?: boolean;
  onToggle: () => void;
}) {
  const label = on ? "마이크 끄기" : "마이크 켜기";
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: "room-mic",
      kind: "button",
      title: null,
      systemImage: on ? "mic.fill" : "mic.slash.fill",
      shape: "circle",
      accessibilityLabel: label,
      tone: on ? "default" : "danger",
      disabled: disabled || inactive,
      faded: hidden,
    },
    onToggle,
    { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
  );
  const Icon = on ? Mic : MicOff;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onPointerDown={playPressPop}
      onClick={onToggle}
      className={on ? roomBarButtonClassName : roomBarDangerButtonClassName}
    >
      {/* key로 상태별 재마운트를 강제해 켬과 끔마다 팝 애니메이션이 다시 돈다. */}
      <Icon
        key={on ? "on" : "off"}
        aria-hidden="true"
        className={cn(
          "size-5.75 animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none regular:size-6.75 short-side-lg:size-8.5",
          // 꺼진 카메라 아이콘의 빨간 사선과 같은 색이다.
          !on && "text-(--session-exit-bg)",
        )}
      />
    </button>
  );
}
