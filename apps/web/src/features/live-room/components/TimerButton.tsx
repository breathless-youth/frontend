import { Timer } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SESSION_SYMBOL_SCALE } from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

import { playPressPop } from "./playPressPop";
import { roomBarButtonClassName } from "./RoomControlBar";

/**
 * 그룹 공부방 바의 타이머 버튼
 *
 * 타이머나 뽀모도로가 도는 동안은 채운 파랑으로 바꿔 바만 봐도 켜져 있다는 것을 알린다.
 * 이 버튼은 타이머를 켜고 끄지 않고 설정 시트를 열어서 눌림 상태 대신 켜짐 표시와 열림 상태를 둔다.
 * 타이머가 도는 동안에는 시트를 열지 않아서 창을 연다고 알리지 않고, 캡슐의 남은 시간을 설명으로 단다.
 * 아이콘은 Figma 자산이 없어 lucide 타이머를 자리 표시로 둔다.
 */
export function TimerButton({
  on,
  expanded,
  disabled = false,
  inactive = false,
  hidden = false,
  describedBy,
  onOpen,
}: {
  /** 타이머나 뽀모도로가 돌거나 멈춰 있다. */
  on: boolean;
  /** 설정 시트가 열려 있다. */
  expanded: boolean;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금 */
  disabled?: boolean;
  /** 버튼을 보인 채 앱 버튼의 누름만 막는 잠금 */
  inactive?: boolean;
  /** 바가 숨으면 앱 버튼을 흐리게 감춘다. */
  hidden?: boolean;
  /** 타이머가 도는 동안 설명으로 읽을 캡슐 남은 시간 요소의 id */
  describedBy?: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation("live-room");
  const label = t("timerButton.aria.label");
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: "room-timer",
      kind: "button",
      title: null,
      systemImage: "timer",
      shape: "circle",
      accessibilityLabel: label,
      tone: on ? "prominent" : "default",
      disabled: disabled || inactive,
      faded: hidden,
    },
    onOpen,
    { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
  );
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-haspopup={on ? undefined : "dialog"}
      aria-expanded={on ? undefined : expanded}
      aria-describedby={on ? describedBy : undefined}
      data-on={on}
      disabled={disabled}
      onPointerDown={playPressPop}
      onClick={onOpen}
      className={cn(
        roomBarButtonClassName,
        "data-[on=true]:border-transparent data-[on=true]:bg-(--state-focus) data-[on=true]:text-white",
      )}
    >
      <Timer aria-hidden="true" className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
    </button>
  );
}
