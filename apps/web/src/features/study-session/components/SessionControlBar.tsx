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
 * 다만 **심플 모드에서는 카메라 전환만 비활성**이다(`flipDisabled`, BY-336) — 상태(일시정지)가
 * 아니라 표시 모드에 걸리는 조건이라 두 축이 섞이지 않는다.
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
  "flex shrink-0 items-center justify-center rounded-full transition-[opacity,background-color] duration-200 motion-reduce:transition-none",
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
      /**
       * 지금 할 수 없는 동작 — 심플 모드의 카메라 전환이 유일한 사례다(BY-336).
       * 버튼을 **없애지 않고 흐리게 남기는** 이유는 컨트롤 바가 세 버튼의 고정 배치이기 때문이다.
       * 하나를 빼면 나머지 두 개가 가운데로 밀려 심플 모드 진입 자체가 레이아웃 점프가 된다.
       */
      disabled: { true: "opacity-40", false: "active:opacity-80" },
    },
    defaultVariants: { size: "responsive", variant: "default", disabled: false },
  },
);

/**
 * 아이콘은 버튼과 같은 비율(44/50 = 0.88)로 줄어든다 — Figma 가로 실측이 정확히 그 비율이다
 * (camera-flip 20 → 18 · exit 19 → 17).
 *
 * ## play와 pause는 프레임 크기가 다르다 (BY-336, 2026-07-31)
 *
 * 둘 다 `16×18` 프레임으로 그려졌지만 **프레임 안에서 잉크가 차지하는 비율이 다르다**:
 *
 * | 아이콘 | 잉크 bbox      | 프레임 대비    |
 * | ------ | -------------- | -------------- |
 * | pause  | 11.56 × 14.22  | 72% × 79%      |
 * | play   | 7.00 × 9.75    | **44% × 54%**  |
 *
 * 그래서 같은 프레임을 주면 화면에서는 재생이 일시정지보다 한참 작아 보인다 — 실기기에서
 * "일시정지는 크고 재생은 작다"로 관측된 것이 이 차이다. 프레임을 **각각** 잡아 실제 글리프
 * 높이를 맞춘다: pause 18 × 0.79 ≈ 14.2 / play 27 × 0.54 ≈ 14.6.
 *
 * - `pause`: Figma 실측(16×18) 그대로 — 이탈 없음.
 * - `play`: **24×27**(1.5배)로 확대. 프레임만 키운 것이라 글리프 비율은 그대로다.
 *
 * 토글 시 프레임 폭이 달라지지만 버튼은 고정 크기(50/44)이고 아이콘은 중앙 정렬이라
 * **레이아웃 폭은 흔들리지 않는다.** 근본 해결은 play를 잉크에 맞게 Figma에서 재익스포트하는
 * 것이고(자산은 손으로 그리지 않는다 — 위 컴포넌트 주석), 그때 이 표도 함께 걷어낸다
 * (SCR-S3-1·S3-2 Review Checklist).
 */
const ICON_SIZE = {
  pause: {
    md: "h-[18px] w-[16px]",
    sm: "h-[15.8px] w-[14px]",
    responsive: "h-[18px] w-[16px] landscape:h-[15.8px] landscape:w-[14px]",
  },
  play: {
    md: "h-[27px] w-[24px]",
    sm: "h-[23.8px] w-[21.1px]",
    responsive: "h-[27px] w-[24px] landscape:h-[23.8px] landscape:w-[21.1px]",
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
   * 카메라 전환을 지금 할 수 없는가 — 심플 모드(S3-4/S3-6)에서 켠다.
   *
   * 심플 모드는 프리뷰를 걷어낸 화면이라 어느 카메라가 열려 있는지 **볼 수 없다.** 그 상태에서
   * 전환을 누르면 화면에는 아무 변화가 없는데 추론만 1~2초 끊기고(전환 중 `detect()` 정지)
   * 토스트만 뜬다 — 사용자에게는 아무 일도 안 일어난 것처럼 보인다.
   */
  flipDisabled?: boolean;
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
  disabled?: boolean;
}

function ControlButton({
  label,
  iconSrc,
  iconClassName,
  size,
  onClick,
  variant = "default",
  disabled = false,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // 네이티브 `disabled`를 쓴다(`aria-disabled`가 아니라) — 누를 수 없는 것이 사실이고,
      // 탭 순서에서도 빠지는 편이 맞다. 심플 모드는 화면 탭 한 번으로 벗어날 수 있어
      // "왜 못 누르는지 모른 채 갇히는" 상태가 되지 않는다.
      disabled={disabled}
      className={controlButtonVariants({ size, variant, disabled })}
    >
      <img src={iconSrc} alt="" aria-hidden="true" className={iconClassName} />
    </button>
  );
}

export function SessionControlBar({
  paused,
  flipDisabled = false,
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
        iconClassName={paused ? ICON_SIZE.play[size] : ICON_SIZE.pause[size]}
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
        disabled={flipDisabled}
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
