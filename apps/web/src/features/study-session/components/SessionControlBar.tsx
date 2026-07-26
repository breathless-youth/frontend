import cameraFlipIcon from "@/assets/icons/session-camera-flip.svg";
import exitIcon from "@/assets/icons/session-exit.svg";
import pauseIcon from "@/assets/icons/session-pause.svg";
import { cn } from "@/lib/utils";

/**
 * 세션 하단 컨트롤 바 (Figma `Session / Control Bar` 34:32).
 *
 * 아이콘은 Figma에서 SVG로 내보내 커밋한 자산이다(`src/assets/icons/session-*.svg`) —
 * 손으로 path를 그리지 않는다. 익스포트에 섞여 오는 캔버스 배경 `<rect>`는 제거했다.
 *
 * 이 컴포넌트가 **탭-투-심플 영역에서 제외되는 hit area 경계**를 책임진다 —
 * `pointer-events-auto`로 바 위 클릭이 뒤의 전체화면 탭 레이어에 닿지 않게 한다.
 *
 * 접근성: 버튼 50×50(44 최소 기준 충족)·간격 22px을 축소하지 않는다.
 */
export interface SessionControlBarProps {
  /** 일시정지 상태면 버튼이 재개로 동작한다. */
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
  variant?: "default" | "exit";
}

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
        "flex size-[50px] shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-80",
        variant === "exit" ? "bg-[var(--session-exit-bg)]" : "bg-white/12",
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
      {/* TODO(WG2): 일시정지 상태의 파란 재개 버튼 스타일은 S3-3(WG2) 범위 — 지금은 같은 버튼이 토글한다. */}
      <ControlButton
        label={paused ? "재개" : "일시정지"}
        iconSrc={pauseIcon}
        iconClassName="h-[18px] w-[16px]"
        onClick={onTogglePause}
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
