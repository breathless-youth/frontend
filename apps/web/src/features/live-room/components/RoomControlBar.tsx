import { useState, type PointerEvent as ReactPointerEvent } from "react";

import cameraIcon from "@/assets/icons/session-camera.svg";
import cameraOffIcon from "@/assets/icons/session-camera-off.svg";
import exitIcon from "@/assets/icons/session-exit.svg";
import { CameraFlipIcon } from "@/components/CameraFlipIcon";

/**
 * 룸 하단 컨트롤 바 3버튼
 */

/**
 * 탭마다 확정적으로 눌림 팝을 재생한다(2026-08-25 피드백 — 싱글룸과 같은 눌림 감각).
 * :active 스케일은 WKWebView의 짧은 탭에서 스치듯 지나가 안 보일 수 있어 JS로 보강한다.
 */
function playPressPop(event: ReactPointerEvent<HTMLButtonElement>) {
  const button = event.currentTarget;
  if (
    typeof button.animate !== "function" ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  ) {
    return;
  }
  button.animate(
    [{ transform: "scale(1)" }, { transform: "scale(0.88)" }, { transform: "scale(1)" }],
    { duration: 220, easing: "ease-out" },
  );
}
type RoomControlBarProps = {
  cameraOn: boolean;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금. 버튼을 없애면 배치가 튀므로 흐리게 남긴다. */
  disabled?: boolean;
  /**
   * 숨김(BY-435 디스코드 패턴) — 바를 화면 아래로 슬라이드해 완전히 내보낸다. 화면 탭이
   * 보임/숨김을 토글하고 자동으로는 내려가지 않는다. 숨김 중 바 영역 탭은 버튼이 아니라
   * 복귀 트리거로만 동작해야 하므로 pointer-events도 함께 끈다.
   */
  hidden?: boolean;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  onExit: () => void;
};

export function RoomControlBar({
  cameraOn,
  disabled = false,
  hidden = false,
  onToggleCamera,
  onFlipCamera,
  onExit,
}: RoomControlBarProps) {
  // 전환 버튼 반 바퀴 회전(BY-435) — 누른 횟수만 세면 CSS 트랜지션이 연속 회전을 만든다.
  // 실제 전환 성공 여부와 무관하게 도는 것은 의도다: 즉각적인 눌림 반응이 목적이다.
  const [flipTurns, setFlipTurns] = useState(0);
  return (
    // 치수는 싱글룸 SessionControlBar 세로 스펙과 동일(버튼 50 · 간격 22 · 좌우 24 · 높이 80,
    // 2026-08-25 BY-427 피드백: 두 룸의 바 크기 통일) — 폭은 내용에 맞춰 242px이 된다.
    <div
      data-testid="room-control-bar"
      // 화면 탭 = 바 토글(디스코드 패턴)이라, 바 자체 조작이 토글로 버블되면 버튼을 누를
      // 때마다 바가 내려간다 — 여기서 끊는다.
      onPointerDown={(event) => event.stopPropagation()}
      // 슬라이드 곡선은 iOS 시트 계열(초반 빠르고 끝을 길게 눌러 정착) — 기본 ease-out
      // 300ms는 올라올 때 '확' 나타나는 인상이 있었다(2026-08-26 피드백, 디스코드 참조).
      // 타일 쪽은 레이아웃 트랜지션 금지(랙·페인트 사고 이력)라 바의 정착감이 토글의
      // 부드러움을 혼자 담당한다.
      className={`flex h-20 items-center gap-[22px] rounded-full border border-white/10 bg-[var(--session-bar-bg)] px-6 backdrop-blur-[7px] transition-transform duration-[500ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
        // 이동량 = 바 높이(100%) + 래퍼의 bottom 오프셋(safe-area+17px) — 화면 밖까지 정확히
        // 나간다. 부모 main의 overflow-hidden이 내려간 바를 잘라 문서 스크롤을 막는다.
        hidden
          ? "pointer-events-none translate-y-[calc(100%+env(safe-area-inset-bottom)+17px)]"
          : "pointer-events-auto translate-y-0"
      }`}
    >
      <button
        type="button"
        aria-label={cameraOn ? "카메라 끄기" : "카메라 켜기"}
        onPointerDown={playPressPop}
        aria-pressed={cameraOn}
        disabled={disabled}
        onClick={onToggleCamera}
        className={`flex size-[50px] items-center justify-center rounded-full transition-[background-color,transform] duration-300 active:scale-90 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none ${
          // 꺼짐은 반투명 레드 필(BY-435 시안 A) — 솔리드 레드인 나가기 버튼과 구분되는
          // 은은한 경고 톤. 색은 나가기와 같은 계열(#ff6b77 = feedback.error.dark)의 20%다.
          cameraOn ? "bg-white/12" : "bg-[#ff6b77]/20"
        }`}
      >
        {/* key로 상태별 재마운트를 강제해 켬↔끔마다 팝 애니메이션이 다시 돈다. */}
        <img
          key={cameraOn ? "on" : "off"}
          src={cameraOn ? cameraIcon : cameraOffIcon}
          alt=""
          className="size-5 animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none"
        />
      </button>
      <button
        type="button"
        aria-label="카메라 전환"
        onPointerDown={playPressPop}
        // 카메라가 꺼져 있으면 전환할 대상이 없다 — 눌리는 척만 하는 버튼을 남기지 않는다
        // (2026-08-25 BY-427 실기기 피드백).
        disabled={disabled || !cameraOn}
        onClick={() => {
          setFlipTurns((turns) => turns + 1);
          onFlipCamera();
        }}
        className="flex size-[50px] items-center justify-center rounded-full bg-white/12 transition-transform duration-200 active:scale-90 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none"
      >
        {/* 몸통은 고정, 안의 화살표만 돈다(2026-08-25 피드백) — 회전은 컴포넌트 내부 g가 처리. */}
        <CameraFlipIcon turns={flipTurns} className="size-5" />
      </button>
      <button
        type="button"
        aria-label="나가기"
        onPointerDown={playPressPop}
        disabled={disabled}
        onClick={onExit}
        className="flex size-[50px] items-center justify-center rounded-full bg-[var(--session-exit-bg)] transition-transform duration-200 active:scale-90 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none"
      >
        <img src={exitIcon} alt="" className="size-5" />
      </button>
    </div>
  );
}
