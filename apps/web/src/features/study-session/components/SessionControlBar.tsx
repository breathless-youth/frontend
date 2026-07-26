import cameraFlipIcon from "@/assets/icons/session-camera-flip.svg";
import exitIcon from "@/assets/icons/session-exit.svg";
import pauseIcon from "@/assets/icons/session-pause.svg";
import playIcon from "@/assets/icons/session-play.svg";
import { cn } from "@/lib/utils";

/**
 * 세션 하단 컨트롤 바 (Figma `Session / Control Bar` 34:32).
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
 * 심플 모드(S3-4)에서도 컨트롤 바는 그대로 유지된다.
 *
 * 접근성: 버튼 50×50(44 최소 기준 충족)·간격 22px을 축소하지 않는다.
 */
export interface SessionControlBarProps {
  /** 일시정지 상태면 첫 버튼이 파란 '다시 시작'으로 바뀐다. */
  paused: boolean;
  onTogglePause: () => void;
  onFlipCamera: () => void;
  onRequestExit: () => void;
  className?: string;
}

interface ControlButtonProps {
  label: string;
  iconSrc: string;
  iconClassName: string;
  onClick: () => void;
  variant?: "default" | "resume" | "exit";
}

const CONTROL_BUTTON_BG = {
  default: "bg-white/12",
  resume: "bg-[var(--session-resume-bg)]",
  exit: "bg-[var(--session-exit-bg)]",
} as const;

function ControlButton({
  label,
  iconSrc,
  iconClassName,
  onClick,
  variant = "default",
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-[50px] shrink-0 items-center justify-center rounded-full transition-[opacity,background-color] duration-200 active:opacity-80 motion-reduce:transition-none",
        CONTROL_BUTTON_BG[variant],
      )}
    >
      <img src={iconSrc} alt="" aria-hidden="true" className={iconClassName} />
    </button>
  );
}

export function SessionControlBar({
  paused,
  onTogglePause,
  onFlipCamera,
  onRequestExit,
  className,
}: SessionControlBarProps) {
  return (
    <div
      role="group"
      aria-label="세션 컨트롤"
      className={cn(
        "pointer-events-auto relative flex h-20 items-center justify-center gap-[22px] rounded-full border border-white/10 bg-[var(--session-bar-bg)] px-6 pt-4 pb-3 backdrop-blur-[7px]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute top-[5px] left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/22"
      />
      {/* 아이콘 전용 버튼이라 이름이 상태를 따라간다. '재개'가 아니라 쉬운 우리말 '다시 시작'
          (voice-tone.md §1) — 아이콘 프레임은 play/pause 모두 16×18로 같아 폭이 흔들리지 않는다. */}
      <ControlButton
        label={paused ? "다시 시작" : "일시정지"}
        iconSrc={paused ? playIcon : pauseIcon}
        iconClassName="h-[18px] w-[16px]"
        onClick={onTogglePause}
        variant={paused ? "resume" : "default"}
      />
      <ControlButton
        label="카메라 전환"
        iconSrc={cameraFlipIcon}
        iconClassName="size-[20px]"
        onClick={onFlipCamera}
      />
      <ControlButton
        label="공부 종료"
        iconSrc={exitIcon}
        iconClassName="size-[19px]"
        onClick={onRequestExit}
        variant="exit"
      />
    </div>
  );
}
