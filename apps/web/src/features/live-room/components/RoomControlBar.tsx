import type { ReactNode } from "react";

import cameraIcon from "@/assets/icons/session-camera.svg";
import cameraOffIcon from "@/assets/icons/session-camera-off.svg";
import exitIcon from "@/assets/icons/session-exit.svg";

import { playPressPop } from "./playPressPop";

const BAR_BUTTON =
  "flex size-13.5 items-center justify-center rounded-full border transition-[background-color,transform] duration-300 active:scale-90 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none regular:size-16 short-side-lg:size-20";

/**
 * 바 안 기본 버튼 모양
 *
 * 자리에 넣는 버튼은 바 밖에서 만들어지므로 이 클래스와 `playPressPop`을 받아야 바 버튼과 같아 보인다.
 */
export const roomBarButtonClassName = `${BAR_BUTTON} border-(--session-btn-default-border) bg-white/10 text-(--session-btn-default-fg)`;

type RoomControlBarProps = {
  cameraOn: boolean;
  /** 제출 중처럼 조작이 안전하지 않은 구간의 잠금. 버튼을 없애면 배치가 튀므로 흐리게 남긴다. */
  disabled?: boolean;
  /**
   * 바를 화면 아래로 내보내는 숨김
   *
   * 숨은 바 자리의 탭은 버튼이 아니라 조작을 다시 부르는 화면 탭이어야 해서 누름을 끄고 inert로 포커스도 막는다.
   */
  hidden?: boolean;
  /**
   * 바를 보인 채 누름만 막는 잠금
   *
   * 모달 메뉴가 열린 동안 바가 누름을 받으면 메뉴 뒤에서 버튼이 눌리고 바깥 누름으로 메뉴가 닫히지 않는다.
   */
  inactive?: boolean;
  /** 카메라와 나가기 사이에 놓는 배경음 버튼 */
  ambient?: ReactNode;
  onToggleCamera: () => void;
  onExit: () => void;
};

/** 룸 하단 컨트롤 바 */
export function RoomControlBar({
  cameraOn,
  disabled = false,
  hidden = false,
  inactive = false,
  ambient,
  onToggleCamera,
  onExit,
}: RoomControlBarProps) {
  return (
    // 버튼 지름은 싱글룸 오른쪽 부가 버튼과 같은 단계를 써서 두 룸의 누르는 크기를 맞춘다.
    <div
      data-testid="room-control-bar"
      data-room-controls=""
      inert={hidden}
      // 화면 탭 = 바 토글(디스코드 패턴)이라, 바 자체 조작이 토글로 버블되면 버튼을 누를
      // 때마다 바가 내려간다 — 여기서 끊는다.
      onPointerDown={(event) => event.stopPropagation()}
      // 슬라이드 곡선은 iOS 시트 계열(초반 빠르고 끝을 길게 눌러 정착) — 기본 ease-out
      // 300ms는 올라올 때 '확' 나타나는 인상이 있었다(2026-08-26 피드백, 디스코드 참조).
      // 타일 쪽은 레이아웃 트랜지션 금지(랙·페인트 사고 이력)라 바의 정착감이 토글의
      // 부드러움을 혼자 담당한다.
      className={`flex h-18.5 items-center gap-3.5 rounded-full bg-(--session-bar-glass-bg) px-2.5 shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] backdrop-blur-[11px] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none regular:h-22 regular:gap-4 regular:px-3 short-side-lg:h-27.5 short-side-lg:gap-5 short-side-lg:px-3.75 ${
        // 이동량은 바 높이에 가장 큰 래퍼 오프셋(태블릿 safe-area+17px)을 더해 어느 배치에서도 화면 밖까지 나간다.
        // 부모 main의 overflow-hidden이 내려간 바를 잘라 문서 스크롤을 막는다.
        hidden ? "translate-y-[calc(100%+env(safe-area-inset-bottom)+17px)]" : "translate-y-0"
      } ${hidden || inactive ? "pointer-events-none" : "pointer-events-auto"}`}
    >
      <button
        type="button"
        aria-label={cameraOn ? "카메라 끄기" : "카메라 켜기"}
        onPointerDown={playPressPop}
        aria-pressed={cameraOn}
        disabled={disabled}
        onClick={onToggleCamera}
        className={
          // 꺼짐은 반투명 레드 필(BY-435 시안 A) — 솔리드 레드인 나가기 버튼과 구분되는
          // 은은한 경고 톤. 색은 나가기와 같은 계열(#ff6b77 = feedback.error.dark)의 20%다.
          cameraOn ? roomBarButtonClassName : `${BAR_BUTTON} border-transparent bg-[#ff6b77]/20`
        }
      >
        {/* key로 상태별 재마운트를 강제해 켬↔끔마다 팝 애니메이션이 다시 돈다. */}
        <img
          key={cameraOn ? "on" : "off"}
          src={cameraOn ? cameraIcon : cameraOffIcon}
          alt=""
          className="size-5.75 animate-[control-icon-pop_220ms_ease-out] motion-reduce:animate-none regular:size-6.75 short-side-lg:size-8.5"
        />
      </button>
      {ambient}
      <button
        type="button"
        aria-label="나가기"
        onPointerDown={playPressPop}
        disabled={disabled}
        onClick={onExit}
        className="flex size-13.5 items-center justify-center rounded-full bg-(--session-control-exit-bg) transition-transform duration-200 active:scale-90 active:opacity-80 disabled:opacity-40 motion-reduce:transition-none regular:size-16 short-side-lg:size-20"
      >
        <img src={exitIcon} alt="" className="size-5.75 regular:size-6.75 short-side-lg:size-8.5" />
      </button>
    </div>
  );
}
