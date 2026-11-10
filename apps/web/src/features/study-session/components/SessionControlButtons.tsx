import type { ReactNode, Ref, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import type { VariantProps } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { controlButtonVariants } from "@/features/study-session/components/controlButtonVariants";
import { cn } from "@/lib/utils";

/**
 * 세션 화면 하단의 일시정지·나가기 버튼
 *
 * 일시정지 중에는 일시정지 버튼이 파란 재개 버튼으로 바뀐다.
 * 버튼이 스스로 `pointer-events-auto`라 뒤의 전체 화면 탭(심플 모드 전환) 레이어에 클릭이 닿지 않는다.
 */

/** 아이콘 팝 애니메이션 — 마운트·아이콘 교체(일시정지↔재개)마다 한 번 재생된다(BY-435 모션). */
export const ICON_POP_CLASS =
  "animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none";

/**
 * 타이머 화면 버튼의 아이콘 크기
 *
 * 폭 600 이상 창과 큰 태블릿도 버튼 지름과 같은 비율을 지킨다.
 */
export const CONTROL_ICON_SIZE = "size-6.5 regular:size-7.5 short-side-lg:size-9.5";

/**
 * 하단 바의 일시정지 아이콘
 *
 * v3 시안의 모서리가 둥근 굵은 막대 두 개를 그대로 옮겼다(lucide `Pause`보다 막대가 넓고 둥글다).
 */
export function PauseGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="5.5" y="4" width="4.5" height="16" rx="1.5" />
      <rect x="14" y="4" width="4.5" height="16" rx="1.5" />
    </svg>
  );
}

/**
 * 하단 바의 종료 아이콘
 *
 * v3 시안의 Heroicons `arrow-right-start-on-rectangle`(문에서 화살표가 나가는 모양)을 그대로 옮겼다.
 */
export function ExitGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  );
}

/**
 * 하단 바의 재개 아이콘
 *
 * v3 시안(턴 25)의 모서리가 둥근 채운 삼각형을 그대로 옮겼다. 시안은 다른 아이콘(22px)보다 한 단계 큰 24px로 그린다.
 */
export function PlayGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6.8 5.2c0-1.1 1.2-1.8 2.15-1.25l10.3 6.05c.93.55.93 1.9 0 2.45l-10.3 6.05C8 19.05 6.8 18.35 6.8 17.25V5.2Z" />
    </svg>
  );
}

/** 재개 아이콘 크기. 바 아이콘과 같은 비율로 키운다(52px 버튼에 24px). */
const PLAY_ICON_SIZE = "size-6 regular:size-7 short-side-lg:size-9";

/**
 * 내 카메라 크게 보기 아이콘
 *
 * v3 시안의 왼쪽 위·오른쪽 아래 모서리로 나가는 화살표(Heroicons `arrows-pointing-out`)를 그대로 옮겼다.
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

/** 하단 바 버튼의 아이콘 크기 */
export const BAR_ICON_SIZE = "size-5.5 regular:size-6.5 short-side-lg:size-8";

/**
 * 싱글룸 하단 바
 *
 * 일시정지·종료 두 버튼을 감싸는 둥근 판이다. 도움말 화면의 가짜 바도 같은 모양을 쓴다.
 */
export const SESSION_BAR =
  "flex items-center gap-2.5 rounded-[32px] bg-(--session-bar-bg) p-2 shadow-[0px_10px_30px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[14px]";

/** 심플 모드의 하단 바. 그림자 없이 옅은 유리로 낮춘다(v3 시안 18i·31a). */
export const SESSION_BAR_MUTED =
  "flex items-center gap-2.5 rounded-[32px] bg-[rgba(16,18,24,0.45)] p-2 shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.16)] backdrop-blur-[20px] backdrop-saturate-140";

interface ControlButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: VariantProps<typeof controlButtonVariants>["variant"];
  size?: VariantProps<typeof controlButtonVariants>["size"];
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function ControlButton({
  label,
  icon,
  onClick,
  variant = "default",
  size = "primary",
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
      className={controlButtonVariants({ variant, size })}
    >
      {icon}
    </Button>
  );
}

export function SessionPauseButton({
  paused,
  onClick,
  muted = false,
}: {
  paused: boolean;
  onClick: () => void;
  /** 심플 모드. 일시정지 중의 다시 시작 버튼은 그대로 눈에 띄게 둔다. */
  muted?: boolean;
}) {
  const { t } = useTranslation("study-session");
  return (
    // 아이콘 전용 버튼이라 이름이 상태를 따라간다. '재개'가 아니라 쉬운 우리말 '다시 시작'
    // (voice-tone.md §1) — key로 리마운트시켜 팝 애니메이션을 재생한다.
    <ControlButton
      label={paused ? t("controls.resume") : t("controls.pause")}
      icon={
        paused ? (
          <PlayGlyph
            key="play"
            data-testid="icon-play"
            aria-hidden="true"
            className={cn(PLAY_ICON_SIZE, ICON_POP_CLASS)}
          />
        ) : (
          <PauseGlyph
            key="pause"
            data-testid="icon-pause"
            aria-hidden="true"
            className={cn(BAR_ICON_SIZE, ICON_POP_CLASS)}
          />
        )
      }
      onClick={onClick}
      variant={paused ? "resume" : muted ? "pauseMuted" : "pause"}
      size="bar"
    />
  );
}

export function SessionExitButton({
  onClick,
  muted = false,
}: {
  onClick: () => void;
  /** 심플 모드 */
  muted?: boolean;
}) {
  const { t } = useTranslation("study-session");
  return (
    <ControlButton
      label={t("controls.exit")}
      icon={
        <ExitGlyph
          data-testid="icon-exit"
          aria-hidden="true"
          className={cn(BAR_ICON_SIZE, ICON_POP_CLASS)}
        />
      }
      onClick={onClick}
      variant={muted ? "stopMuted" : "stop"}
      size="bar"
    />
  );
}
