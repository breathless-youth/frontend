import { forwardRef, useId, type PointerEventHandler, type ReactNode } from "react";
import { AudioLines, Music } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

export interface AmbientSoundButtonProps {
  /** 켜진 소리 여부 */
  on: boolean;
  /** 페이지 개폐 상태 */
  expanded: boolean;
  onClick: () => void;
  /** 간단 모드에서 앱 버튼을 흐리게 감춘다. */
  faded?: boolean;
  /**
   * 앱 glass 버튼 id
   *
   * 싱글룸과 소셜룸이 같은 id를 쓰지 않게 놓인 화면이 정한다.
   * `null`이면 앱 부품으로 등록하지 않고 웹이 그린다.
   */
  nativeId?: string | null;
  /**
   * 버튼을 보인 채 앱 버튼의 누름만 막는 잠금
   *
   * 웹 버튼은 놓인 자리가 누름을 막지만 앱 버튼은 웹 위 다른 층에 그려져 그 잠금이 닿지 않는다.
   */
  inactive?: boolean;
  /**
   * 세션 유리 모양 대신 쓰는 바깥 모양
   *
   * 유리 클래스와 섞으면 바탕·그림자·pointer-events-auto가 남아 놓인 자리의 버튼과 달라 보이고 그 자리의 누름 잠금도 뚫는다.
   */
  className?: string;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금 */
  disabled?: boolean;
  /** 놓인 화면의 아이콘. 기본은 음표다. */
  icon?: ReactNode;
}

/**
 * 세션 화면의 배경음 진입 버튼
 *
 * 기본 모양은 다른 세션 버튼과 같은 `controlButtonVariants`라 싱글룸 버튼 줄에 섞여도 같아 보인다.
 * 기본 모양에는 `pointer-events-auto`가 들어 있어 `pointer-events-none`인 세션 레이어 위에서도 눌린다.
 * 아이콘은 Figma 자산이 없어 lucide 음표를 자리 표시로 둔다.
 */
export const AmbientSoundButton = forwardRef<HTMLButtonElement, AmbientSoundButtonProps>(
  function AmbientSoundButton(
    {
      on,
      expanded,
      onClick,
      faded = false,
      nativeId = "session-ambient",
      inactive = false,
      className = controlButtonVariants(),
      onPointerDown,
      disabled = false,
      icon = (
        <Music aria-hidden="true" className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
      ),
    },
    ref,
  ) {
    const { t } = useTranslation("ambient-sound");
    const label = on ? t("button.on") : t("button.off");
    const control = useNativeControl<HTMLButtonElement>(
      nativeId === null
        ? null
        : {
            id: nativeId,
            kind: "button",
            title: null,
            systemImage: "music.note",
            shape: "circle",
            disabled: disabled || inactive,
            accessibilityLabel: label,
            tone: on ? "active" : "default",
            faded,
          },
      onClick,
      { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
    );
    return (
      <button
        // 페이지를 닫은 뒤 포커스를 돌려줄 ref와 앱 부품 등록이 같은 요소를 받는다.
        ref={(node) => {
          control.ref(node);
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        type="button"
        // 이 버튼은 소리를 켜고 끄지 않고 페이지를 연다. aria-pressed 를 달면 보조기기에 토글로
        // 읽혀 실제 동작과 어긋난다. 재생 여부는 이름으로 전한다.
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        data-on={on}
        disabled={disabled}
        onClick={onClick}
        onPointerDown={onPointerDown}
        className={cn(className, "data-[on=true]:text-(--state-focus)")}
      >
        {icon}
      </button>
    );
  },
);

/**
 * 싱글룸 머리 줄의 배경음 아이콘
 *
 * 꺼져 있으면 회색에 빗금을 긋고, 켜져 있으면 막대 모양은 그대로 두고 흰색·회색 그라데이션이 왼쪽에서 오른쪽으로 천천히 흐른다.
 * 막대가 폭 0인 선이라 그라데이션은 아이콘 좌표계(userSpaceOnUse)로 잡는다(objectBoundingBox면 선이 사라진다).
 * 한 주기만큼 옮겨 이음매 없이 반복하고, 동작 줄이기 설정이면 흐름 없이 그라데이션만 둔다.
 */
export function AmbientLinesIcon({ on }: { on: boolean }) {
  // useId 값의 콜론 같은 문자는 url(#…) 안에서 깨져서 영숫자만 남긴다.
  const gradientId = `ambient-flow-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <AudioLines
      aria-hidden="true"
      // 선마다 반투명을 주면 빗금과 막대가 겹친 곳만 밝아져서 아이콘 전체를 한 번에 흐리게 한다.
      className={cn("size-5", !on && "opacity-40")}
      strokeWidth={1.5}
      color={on ? `url(#${gradientId})` : "currentColor"}
    >
      {/* 꺼짐은 lucide의 다른 *-off 아이콘처럼 왼쪽 위에서 오른쪽 아래로 빗금을 긋는다. */}
      {!on && <path data-testid="ambient-off-slash" d="m3 3 18 18" />}
      {on && (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            x2="24"
            y1="0"
            y2="0"
            spreadMethod="repeat"
          >
            <stop offset="0" stopColor="white" stopOpacity="0.4" />
            <stop offset="0.5" stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0.4" />
            {!prefersReducedMotion() && (
              <>
                <animate attributeName="x1" values="-24;0" dur="2s" repeatCount="indefinite" />
                <animate attributeName="x2" values="0;24" dur="2s" repeatCount="indefinite" />
              </>
            )}
          </linearGradient>
        </defs>
      )}
    </AudioLines>
  );
}
