import { type VariantProps, cva } from "class-variance-authority";

import cameraFlipIcon from "@/assets/icons/session-camera-flip.svg";
import exitIcon from "@/assets/icons/session-exit.svg";
import pauseIcon from "@/assets/icons/session-pause.svg";
import playIcon from "@/assets/icons/session-play.svg";
import { cn } from "@/lib/utils";

/**
 * 세션 하단 컨트롤 바 (Figma `Session / Control Bar` 34:32 · 가로 `control-bar-landscape` 61:463).
 *
 * 아이콘은 Figma에서 SVG로 내보내 커밋한 자산이다(`src/assets/icons/session-*.svg`) —
 * 손으로 path를 그리지 않는다. 익스포트에 섞여 오는 캔버스 배경 `<rect>`는 제거했다.
 *
 * S3-3(일시정지)에서 첫 버튼이 **파란 재개 버튼**으로 바뀐다. Figma에서 이건 컴포넌트
 * variant가 아니라 인스턴스 오버라이드(`59:362` 안의 `btn/pause` → `#3182F6` + `icon/play`)라
 * 코드에서도 별도 컴포넌트가 아니라 `paused` prop 하나로 처리한다.
 * 나머지 두 버튼은 일시정지 중에도 Figma상 비활성 처리가 없다 — 시각적으로 활성을 유지한다.
 *
 * 이 컴포넌트가 **탭-투-심플 영역에서 제외되는 hit area 경계**를 책임진다 —
 * `pointer-events-auto`로 바 위 클릭이 뒤의 전체화면 탭 레이어에 닿지 않게 한다.
 * 심플 모드(S3-4/S3-6)에서도 컨트롤 바는 그대로 유지된다.
 *
 * ## 세로/가로 축소 변형 (S3-5·S3-6)
 *
 * Figma는 가로 프레임에서 `Session / Control Bar` 인스턴스를 쓰지 않고 크기가 다른 로컬
 * 프레임으로 복제해 뒀지만(SCR-S3-5·S3-6 Review Checklist에 Figma 정리 항목으로 올라가 있다),
 * **버튼 구성·순서·색·동작이 완전히 같으므로 코드에서는 하나의 컴포넌트 + `size` 변형**으로
 * 통합한다. 치수를 컴포넌트 안에 하드코딩하지 않고 prop으로 연 이유가 이것이다.
 *
 * | 치수      | `md`(세로 S3-1 `58:361`) | `sm`(가로 S3-5 `61:463`) |
 * | --------- | ------------------------ | ------------------------ |
 * | 바        | 244×80 · px24/pt16/pb12  | 218×68 · px22/pt13/pb9   |
 * | 버튼      | 50                       | 44                       |
 * | 버튼 간격 | 22                       | 20                       |
 * | 핸들      | 36×4 (top 5)             | 28×3 (top 4)             |
 * | 배경      | `#161B22` 55%            | `#161B22` 62%            |
 *
 * 기본값 `responsive`는 **하나의 DOM으로 두 치수를 모두 그린다**(`@media (orientation: landscape)`).
 * 회전 시 컴포넌트를 언마운트/재마운트하지 않아야 포커스가 유지되기 때문에(SCR-S3-5·S3-6
 * Accessibility) 방향 판정은 JS가 아니라 CSS가 한다. `md`/`sm`은 방향과 무관하게 치수를 고정해야
 * 할 때(다른 화면에서의 재사용, 미디어쿼리를 평가하지 않는 jsdom 테스트)를 위해 남겨 둔다.
 *
 * 접근성: 버튼은 가로에서 44×44로 줄어 **최소 터치 타겟을 정확히 충족**한다 —
 * 이보다 더 줄이지 않는다. 세로 50, 간격 22도 축소하지 않는다.
 */

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const sessionControlBarVariants = cva(
  "pointer-events-auto relative flex items-center justify-center rounded-full border border-white/10 backdrop-blur-[7px]",
  {
    variants: {
      size: {
        md: "h-20 gap-[22px] bg-[var(--session-bar-bg)] px-6 pt-4 pb-3",
        sm: "h-[68px] gap-5 bg-[var(--session-bar-bg-compact)] px-[22px] pt-[13px] pb-[9px]",
        responsive:
          "h-20 gap-[22px] bg-[var(--session-bar-bg)] px-6 pt-4 pb-3 landscape:h-[68px] landscape:gap-5 landscape:bg-[var(--session-bar-bg-compact)] landscape:px-[22px] landscape:pt-[13px] landscape:pb-[9px]",
      },
    },
    defaultVariants: { size: "responsive" },
  },
);

export type SessionControlBarSize = NonNullable<
  VariantProps<typeof sessionControlBarVariants>["size"]
>;

/** 바 상단의 드래그 핸들 — 장식이라 `aria-hidden`이다(실제로 드래그되지 않는다). */
const handleVariants = cva("absolute left-1/2 -translate-x-1/2 rounded-full bg-white/22", {
  variants: {
    size: {
      md: "top-[5px] h-1 w-9",
      sm: "top-1 h-[3px] w-7",
      responsive: "top-[5px] h-1 w-9 landscape:top-1 landscape:h-[3px] landscape:w-7",
    },
  },
  defaultVariants: { size: "responsive" },
});

const controlButtonVariants = cva(
  "flex shrink-0 items-center justify-center rounded-full transition-[opacity,background-color] duration-200 active:opacity-80 motion-reduce:transition-none",
  {
    variants: {
      size: {
        md: "size-[50px]",
        sm: "size-[44px]",
        responsive: "size-[50px] landscape:size-[44px]",
      },
      variant: {
        default: "bg-white/12",
        resume: "bg-[var(--session-resume-bg)]",
        exit: "bg-[var(--session-exit-bg)]",
      },
    },
    defaultVariants: { size: "responsive", variant: "default" },
  },
);

/**
 * 아이콘은 버튼과 같은 비율(44/50 = 0.88)로 줄어든다 — Figma 가로 실측이 정확히 그 비율이다
 * (pause 16×18 → 14×15.8 · camera-flip 20 → 18 · exit 19 → 17).
 */
const ICON_SIZE = {
  pause: {
    md: "h-[18px] w-[16px]",
    sm: "h-[15.8px] w-[14px]",
    responsive: "h-[18px] w-[16px] landscape:h-[15.8px] landscape:w-[14px]",
  },
  cameraFlip: {
    md: "size-[20px]",
    sm: "size-[18px]",
    responsive: "size-[20px] landscape:size-[18px]",
  },
  exit: {
    md: "size-[19px]",
    sm: "size-[17px]",
    responsive: "size-[19px] landscape:size-[17px]",
  },
} as const satisfies Record<string, Record<SessionControlBarSize, string>>;

export interface SessionControlBarProps {
  /** 일시정지 상태면 첫 버튼이 파란 '다시 시작'으로 바뀐다. */
  paused: boolean;
  /**
   * 바·버튼·핸들·아이콘 치수. 기본 `responsive`는 세로 치수로 그리고 가로에서만 축소한다.
   * `md`/`sm`으로 고정할 수도 있다(치수를 컴포넌트 안에 가두지 않는다).
   */
  size?: SessionControlBarSize;
  onTogglePause: () => void;
  onFlipCamera: () => void;
  onRequestExit: () => void;
  className?: string;
}

interface ControlButtonProps {
  label: string;
  iconSrc: string;
  iconClassName: string;
  size: SessionControlBarSize;
  onClick: () => void;
  variant?: VariantProps<typeof controlButtonVariants>["variant"];
}

function ControlButton({
  label,
  iconSrc,
  iconClassName,
  size,
  onClick,
  variant = "default",
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={controlButtonVariants({ size, variant })}
    >
      <img src={iconSrc} alt="" aria-hidden="true" className={iconClassName} />
    </button>
  );
}

export function SessionControlBar({
  paused,
  size = "responsive",
  onTogglePause,
  onFlipCamera,
  onRequestExit,
  className,
}: SessionControlBarProps) {
  return (
    <div
      role="group"
      aria-label="세션 컨트롤"
      className={cn(sessionControlBarVariants({ size }), className)}
    >
      <span aria-hidden="true" className={handleVariants({ size })} />
      {/* 아이콘 전용 버튼이라 이름이 상태를 따라간다. '재개'가 아니라 쉬운 우리말 '다시 시작'
          (voice-tone.md §1) — 아이콘 프레임은 play/pause 모두 같은 크기라 폭이 흔들리지 않는다. */}
      <ControlButton
        label={paused ? "다시 시작" : "일시정지"}
        iconSrc={paused ? playIcon : pauseIcon}
        iconClassName={ICON_SIZE.pause[size]}
        size={size}
        onClick={onTogglePause}
        variant={paused ? "resume" : "default"}
      />
      <ControlButton
        label="카메라 전환"
        iconSrc={cameraFlipIcon}
        iconClassName={ICON_SIZE.cameraFlip[size]}
        size={size}
        onClick={onFlipCamera}
      />
      <ControlButton
        label="공부 종료"
        iconSrc={exitIcon}
        iconClassName={ICON_SIZE.exit[size]}
        size={size}
        onClick={onRequestExit}
        variant="exit"
      />
    </div>
  );
}
