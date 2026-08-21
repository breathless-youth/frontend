import cameraIcon from "@/assets/icons/session-camera.svg";
import cameraFlipIcon from "@/assets/icons/session-camera-flip.svg";
import exitIcon from "@/assets/icons/session-exit.svg";

/**
 * 룸 하단 컨트롤 바 3버튼
 */
type RoomControlBarProps = {
  cameraOn: boolean;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금. 버튼을 없애면 배치가 튀므로 흐리게 남긴다. */
  disabled?: boolean;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  onExit: () => void;
};

export function RoomControlBar({
  cameraOn,
  disabled = false,
  onToggleCamera,
  onFlipCamera,
  onExit,
}: RoomControlBarProps) {
  return (
    <div className="pointer-events-auto flex h-20 w-full max-w-[314px] items-center justify-between rounded-full border border-white/10 bg-[var(--session-bar-bg)] px-6 backdrop-blur-[7px]">
      <button
        type="button"
        aria-label={cameraOn ? "카메라 끄기" : "카메라 켜기"}
        aria-pressed={cameraOn}
        disabled={disabled}
        onClick={onToggleCamera}
        className={`flex size-[50px] items-center justify-center rounded-full active:opacity-80 disabled:opacity-40 ${
          cameraOn ? "bg-white/12" : "bg-white/25"
        }`}
      >
        <img src={cameraIcon} alt="" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="카메라 전환"
        disabled={disabled}
        onClick={onFlipCamera}
        className="flex size-[50px] items-center justify-center rounded-full bg-white/12 active:opacity-80 disabled:opacity-40"
      >
        <img src={cameraFlipIcon} alt="" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="나가기"
        disabled={disabled}
        onClick={onExit}
        className="flex size-[50px] items-center justify-center rounded-full bg-[var(--session-exit-bg)] active:opacity-80 disabled:opacity-40"
      >
        <img src={exitIcon} alt="" className="size-5" />
      </button>
    </div>
  );
}
