import type { ReactNode, Ref, SVGProps } from "react";
import { LogOut, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import {
  controlButtonVariants,
  SESSION_SYMBOL_SCALE,
} from "@/features/study-session/components/controlButtonVariants";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

/**
 * 세션 화면 하단 양 끝의 일시정지·나가기 버튼
 *
 * 일시정지 중에는 일시정지 버튼이 파란 재개 버튼으로 바뀐다.
 * 버튼이 스스로 `pointer-events-auto`라 뒤의 전체 화면 탭(심플 모드 전환) 레이어에 클릭이 닿지 않는다.
 */

/** 아이콘 팝 애니메이션 — 마운트·아이콘 교체(일시정지↔재개)마다 한 번 재생된다(BY-435 모션). */
export const ICON_POP_CLASS =
  "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none";

/**
 * 하단 두 버튼의 아이콘 크기
 *
 * 버튼을 한 단계 키운 만큼 아이콘도 같은 비율로 키운다.
 * 폭 600 이상 창과 큰 태블릿도 버튼 지름과 같은 비율을 지킨다.
 */
export const CONTROL_ICON_SIZE = "size-6.5 regular:size-7.5 short-side-lg:size-9.5";

interface ControlButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: VariantProps<typeof controlButtonVariants>["variant"];
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function ControlButton({
  label,
  icon,
  onClick,
  variant = "default",
  disabled,
  ref,
}: ControlButtonProps) {
  return (
    <Button
      ref={ref}
      type="button"
      size="icon"
      variant="unstyled"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={controlButtonVariants({ variant, size: "primary" })}
    >
      {icon}
    </Button>
  );
}

export function SessionPauseButton({
  paused,
  onClick,
  inactive = false,
  faded = false,
}: {
  paused: boolean;
  onClick: () => void;
  /** 버튼을 보인 채 앱 버튼의 누름만 막는 잠금 */
  inactive?: boolean;
  /** 앱 버튼을 흐리게 감춘다. 간단 모드에서는 남는 버튼이라 도움말 화면만 쓴다. */
  faded?: boolean;
}) {
  const { t } = useTranslation("study-session");
  const label = paused ? t("controls.resume") : t("controls.pause");
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: "session-pause",
      kind: "button",
      title: null,
      systemImage: paused ? "play.fill" : "pause.fill",
      shape: "circle",
      disabled: inactive,
      accessibilityLabel: label,
      tone: paused ? "prominent" : "default",
      faded,
    },
    onClick,
    { measureIcon: true },
  );
  return (
    // 아이콘 전용 버튼이라 이름이 상태를 따라간다. '재개'가 아니라 쉬운 우리말 '다시 시작'
    // (voice-tone.md §1) — key로 리마운트시켜 팝 애니메이션을 재생한다.
    <ControlButton
      ref={ref}
      label={label}
      icon={
        paused ? (
          <Play
            key="play"
            data-testid="icon-play"
            aria-hidden="true"
            fill="currentColor"
            className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
          />
        ) : (
          <Pause
            key="pause"
            data-testid="icon-pause"
            aria-hidden="true"
            fill="currentColor"
            className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
          />
        )
      }
      onClick={onClick}
      variant={paused ? "resume" : "default"}
    />
  );
}

export function SessionExitButton({
  onClick,
  faded = false,
  inactive = false,
}: {
  onClick: () => void;
  /** 간단 모드에서 앱 버튼을 흐리게 감춘다. */
  faded?: boolean;
  /** 버튼을 보인 채 앱 버튼의 누름만 막는 잠금 */
  inactive?: boolean;
}) {
  const { t } = useTranslation("study-session");
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: "session-exit",
      kind: "button",
      title: null,
      systemImage: "rectangle.portrait.and.arrow.right",
      shape: "circle",
      disabled: inactive,
      accessibilityLabel: t("controls.exit"),
      tone: "danger",
      faded,
    },
    onClick,
    { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
  );
  return (
    <ControlButton
      ref={ref}
      label={t("controls.exit")}
      icon={
        <LogOut
          data-testid="icon-exit"
          aria-hidden="true"
          className={cn(CONTROL_ICON_SIZE, ICON_POP_CLASS)}
        />
      }
      onClick={onClick}
      variant="exit"
    />
  );
}

/**
 * 내 카메라 크게 보기 아이콘
 *
 * 시안의 왼쪽 위·오른쪽 아래 모서리로 나가는 화살표(Heroicons `arrows-pointing-out`)를 그대로 옮겼다.
 * lucide `Maximize2`는 오른쪽 위·왼쪽 아래 방향이라 시안과 다르다.
 */
export function ExpandGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}

/** 내 카메라 작게 보기 아이콘. 크게 보기와 같은 두 모서리에서 가운데로 들어오는 화살표(Heroicons `arrows-pointing-in`)다. */
export function ShrinkGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
    </svg>
  );
}
