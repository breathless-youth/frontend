import type { CSSProperties, ReactNode, Ref } from "react";

import type { RoomMember } from "@focusmakers/types";

import { cn } from "@/lib/utils";

import { formatStudyHhMm } from "../roomGrid";
import { RoomAvatarFallback } from "./RoomAvatarFallback";

/**
 * UI
 * 룸 멤버 타일
 */

/** 내 타일 전용 상태 뱃지의 상태 축 — 서버 값이 아니라 로컬 세션 값에서만 유도한다. */
export type SelfBadgeState = "FOCUS" | "DISTRACTED" | "PAUSED";

/**
 * 뱃지가 그릴 수 있는 전체 상태
 */
export type TileBadgeState = SelfBadgeState | "OFF";

/**
 * 상태별 뱃지 표현
 */
const SELF_BADGE_SPEC: Record<TileBadgeState, { label: string; pill: CSSProperties; ink: string }> =
  {
    FOCUS: {
      label: "집중 측정 중",
      pill: {
        backgroundColor: "color-mix(in srgb, var(--state-focus) 20%, transparent)",
        borderColor: "color-mix(in srgb, var(--state-focus) 38%, transparent)",
      },
      ink: "var(--state-focus)",
    },
    DISTRACTED: {
      label: "비집중",
      pill: {
        backgroundColor: "color-mix(in srgb, var(--state-distract) 20%, transparent)",
        borderColor: "color-mix(in srgb, var(--state-distract) 38%, transparent)",
      },
      ink: "var(--state-distract)",
    },
    PAUSED: {
      label: "일시정지",
      pill: {
        backgroundColor: "rgba(22, 27, 34, 0.72)",
        borderColor: "rgba(255, 255, 255, 0.14)",
      },
      ink: "var(--text-tertiary)",
    },
    OFF: {
      label: "",
      pill: {
        backgroundColor: "rgba(22, 27, 34, 0.72)",
        borderColor: "rgba(255, 255, 255, 0.14)",
      },
      ink: "var(--text-tertiary)",
    },
  };

/**
 * 내 타일 전용 순공 타이머 상태 뱃지
 * 색만으로 상태를 전달하지 않도록 sr-only 상태 텍스트를 포함한다.
 */
export function SelfStateBadge({
  state,
  focusSec,
  className,
}: {
  state: TileBadgeState;
  focusSec: number | undefined;
  className?: string;
}) {
  const spec = SELF_BADGE_SPEC[state];
  return (
    <div
      data-testid="self-state-badge"
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] backdrop-blur",
        className,
      )}
      style={spec.pill}
    >
      <span
        aria-hidden="true"
        data-testid="self-state-dot"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: spec.ink }}
      />
      <span className="text-[13px] leading-4 font-bold tabular-nums" style={{ color: spec.ink }}>
        {focusSec === undefined ? "--:--" : formatStudyHhMm(focusSec)}
      </span>
      {spec.label !== "" && <span className="sr-only">{spec.label}</span>}
    </div>
  );
}

type RoomTileProps = {
  member: RoomMember;
  /** 배경 미디어(내 타일의 로컬 카메라). 없거나 카메라 끔이면 아바타를 그린다. */
  media?: ReactNode;
  /**
   * 내 타일에만 넘긴다.
   */
  selfState?: SelfBadgeState;
  /** 내 타일에만 넘긴다 — 카메라 켜기 모달이 미리보기 비율을 맞추려고 타일 박스를 잰다. */
  rootRef?: Ref<HTMLDivElement>;
  /**
   * 바 숨김 상태 — 이름·목표를 감추고 타이머 뱃지만 남긴다. 언마운트 대신 opacity로 지워 바 토글과 같은 박자로 페이드된다.
   */
  infoHidden?: boolean;
  className?: string;
};

export function RoomTile({
  member,
  media,
  selfState,
  rootRef,
  infoHidden = false,
  className,
}: RoomTileProps) {
  const showMedia = member.cameraOn && media !== undefined;
  return (
    <div
      ref={rootRef}
      data-testid="room-tile"
      data-user-id={member.userId}
      data-state={member.cameraOn ? member.focusState : "OFF"}
      className={`relative overflow-hidden rounded-xl bg-[var(--session-dialog-bg)] ${className ?? ""}`}
    >
      {showMedia ? (
        <div className="absolute inset-0">{media}</div>
      ) : (
        <RoomAvatarFallback nickname={member.nickname} />
      )}
      {showMedia && (
        /* 영상 위 텍스트 가독성용 하단 스크림 */
        <div
          aria-hidden="true"
          data-testid="tile-scrim"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-[76px] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_100%)]",
            // 500ms·시트 곡선은 바 슬라이드(RoomControlBar)·타일 FLIP(LiveRoomSession)과
            // 도착 시점을 맞춘 값이다(2026-08-26 피드백) — 셋을 함께 바꿀 것.
            "transition-opacity duration-[500ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            infoHidden && "opacity-0",
          )}
        />
      )}
      {/* 타이머 뱃지 */}
      <SelfStateBadge
        state={
          selfState ??
          (member.cameraOn ? (member.focusState === "DISTRACTED" ? "DISTRACTED" : "FOCUS") : "OFF")
        }
        focusSec={member.focusSec}
        className="absolute top-3 left-3"
      />
      <div
        data-testid="tile-info"
        aria-hidden={infoHidden || undefined}
        className={cn(
          "absolute bottom-3 left-3 transition-opacity duration-[500ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          infoHidden && "opacity-0",
        )}
      >
        <p className="text-[15px] font-bold text-white">
          {member.nickname}
          {/* 타 참가자의 집중상태는 시각 표시가 없다 */}
          <span className="sr-only">
            {member.cameraOn
              ? member.focusState === "FOCUS"
                ? " 집중 중"
                : " 비집중"
              : " 카메라 꺼짐"}
          </span>
        </p>
        {member.goal != null && (
          <p className="mt-1 text-xs leading-[15px] text-white/72">{member.goal}</p>
        )}
      </div>
    </div>
  );
}
