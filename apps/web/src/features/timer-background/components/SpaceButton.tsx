import { Image } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";

export interface SpaceButtonProps {
  expanded: boolean;
  onClick: () => void;
  /** 심플 모드에서 앱 버튼을 흐리게 감춘다. */
  faded?: boolean;
  /** 더보기 메뉴가 열린 동안 앱 버튼 누름만 막는다. 앱 버튼은 웹 위 다른 층이라 웹 잠금이 닿지 않는다. */
  inactive?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * 세로 열 맨 위 공간 버튼
 *
 * 고른 공간은 화면 배경으로 보여서 버튼에 켜짐 색을 두지 않는다.
 */
export function SpaceButton({
  expanded,
  onClick,
  faded = false,
  inactive = false,
  ref,
}: SpaceButtonProps) {
  const { t } = useTranslation("study-session");
  const label = t("space.button");
  const control = useNativeControl<HTMLButtonElement>(
    {
      id: "session-space",
      kind: "button",
      title: null,
      systemImage: "photo",
      shape: "circle",
      disabled: inactive,
      accessibilityLabel: label,
      tone: "default",
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
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onClick}
      className={controlButtonVariants()}
    >
      <Image aria-hidden="true" className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
    </button>
  );
}
