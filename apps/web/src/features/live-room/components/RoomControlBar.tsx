import cameraIcon from "@/assets/icons/session-camera.svg";
import cameraFlipIcon from "@/assets/icons/session-camera-flip.svg";
import cameraOffIcon from "@/assets/icons/session-camera-off.svg";
import exitIcon from "@/assets/icons/session-exit.svg";

/**
 * 룸 하단 컨트롤 바 3버튼
 */
type RoomControlBarProps = {
  cameraOn: boolean;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금. 버튼을 없애면 배치가 튀므로 흐리게 남긴다. */
  disabled?: boolean;
  /**
   * 자동 숨김 잔상(BY-427 시안 B) — 바만 반투명(0.22)으로 남긴다. 잔상 중 바 영역 탭은
   * 버튼이 아니라 화면 복귀 트리거로만 동작해야 하므로 pointer-events도 함께 끈다.
   */
  faded?: boolean;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  onExit: () => void;
};

export function RoomControlBar({
  cameraOn,
  disabled = false,
  faded = false,
  onToggleCamera,
  onFlipCamera,
  onExit,
}: RoomControlBarProps) {
  return (
    // 치수는 싱글룸 SessionControlBar 세로 스펙과 동일(버튼 50 · 간격 22 · 좌우 24 · 높이 80,
    // 2026-08-25 BY-427 피드백: 두 룸의 바 크기 통일) — 폭은 내용에 맞춰 242px이 된다.
    <div
      data-testid="room-control-bar"
      className={`flex h-20 items-center gap-[22px] rounded-full border border-white/10 bg-[var(--session-bar-bg)] px-6 backdrop-blur-[7px] transition-opacity duration-300 motion-reduce:transition-none ${
        faded ? "pointer-events-none opacity-[0.22]" : "pointer-events-auto"
      }`}
    >
      <button
        type="button"
        aria-label={cameraOn ? "카메라 끄기" : "카메라 켜기"}
        aria-pressed={cameraOn}
        disabled={disabled}
        onClick={onToggleCamera}
        className={`flex size-[50px] items-center justify-center rounded-full active:opacity-80 disabled:opacity-40 ${
          // 꺼짐은 흰색 반전 강조(BY-427 시안 B) — 항상-다크 화면 위 반전이라 테마 토큰이 아닌
          // bg.layer2 light 값(#f2f4f6) 리터럴을 쓴다. 아이콘도 어두운 사선 버전으로 바꾼다.
          cameraOn ? "bg-white/12" : "bg-[#f2f4f6]"
        }`}
      >
        <img src={cameraOn ? cameraIcon : cameraOffIcon} alt="" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="카메라 전환"
        // 카메라가 꺼져 있으면 전환할 대상이 없다 — 눌리는 척만 하는 버튼을 남기지 않는다
        // (2026-08-25 BY-427 실기기 피드백).
        disabled={disabled || !cameraOn}
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
