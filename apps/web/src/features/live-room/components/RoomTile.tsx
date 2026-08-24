import type { CSSProperties, ReactNode } from "react";

import type { RoomMember } from "@focusmakers/types";

import { cn } from "@/lib/utils";

import { formatStudyHhMm } from "../roomGrid";

/**
 * UI
 * 룸 멤버 타일
 *
 * - 타일 서피스는 라이트 모드에서도 다크 고정
 */

/** 내 타일 전용 상태 뱃지의 상태 축 — 서버 값이 아니라 로컬 세션 값에서만 유도한다. */
export type SelfBadgeState = "FOCUS" | "DISTRACTED" | "PAUSED";

/**
 * 뱃지가 그릴 수 있는 전체 상태 — 내 타일 3상태에 더해, 타 참가자 타일용 중립 2상태
 * (2026-08-25 BY-427 피드백: 타 참가자도 뱃지로 감싸되 색은 흰/회색만).
 * NEUTRAL = 카메라 켬(흰색) / OFF = 카메라 꺼짐(회색, 시각은 PAUSED와 동일하되
 * 상태 라벨은 닉네임 옆 sr-only(" 카메라 꺼짐")가 전담하므로 뱃지에는 없다).
 */
export type TileBadgeState = SelfBadgeState | "NEUTRAL" | "OFF";

/**
 * 상태별 뱃지 표현 — 2026-08-25 BY-427 시안 A "서브틀 필".
 * 색은 CSS 변수를 읽는다 — LiveRoomSession이 sessionSurfaceStyle로 다크 값을 덮어쓰므로
 * 라이트 모드에서도 다크 값으로 동작한다(세션 화면은 항상 다크).
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
    NEUTRAL: {
      label: "",
      pill: {
        backgroundColor: "rgba(22, 27, 34, 0.72)",
        borderColor: "rgba(255, 255, 255, 0.14)",
      },
      ink: "#ffffff",
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
 * 내 타일 전용 순공 타이머 상태 뱃지 — 1인 전체화면(RoomTile 미사용)도 같은 규칙으로 쓴다.
 * 색만으로 상태를 전달하지 않도록 sr-only 상태 텍스트를 포함한다.
 */
export function SelfStateBadge({
  state,
  studySeconds,
  className,
}: {
  state: TileBadgeState;
  studySeconds: number | undefined;
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
        {studySeconds === undefined ? "--:--" : formatStudyHhMm(studySeconds)}
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
   * 내 타일에만 넘긴다(BY-427) — 값이 있으면 좌상단 뱃지가 상태 3색을 그린다.
   * 타 참가자 타일은 undefined로 두면 같은 뱃지 크롬에 흰(켬)/회색(꺼짐)만 쓴다.
   */
  selfState?: SelfBadgeState;
  className?: string;
};

export function RoomTile({ member, media, selfState, className }: RoomTileProps) {
  const showMedia = member.cameraOn && media !== undefined;
  return (
    <div
      data-testid="room-tile"
      data-user-id={member.userId}
      data-state={member.cameraOn ? member.focusState : "OFF"}
      className={`relative overflow-hidden rounded-3xl bg-[var(--session-dialog-bg)] ${className ?? ""}`}
    >
      {showMedia ? (
        <div className="absolute inset-0">{media}</div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-white/10">
            <span className="text-xl font-bold text-white">{member.nickname?.charAt(0) ?? ""}</span>
          </div>
        </div>
      )}
      {showMedia && (
        /* 영상 위 텍스트 가독성용 하단 스크림(BY-427 시안 A) — 아바타 타일에는 넣지 않는다. */
        <div
          aria-hidden="true"
          data-testid="tile-scrim"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[76px] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_100%)]"
        />
      )}
      {/* 타이머 뱃지 — 내 타일은 3상태 색, 타 참가자는 흰(켬)/회색(꺼짐)만(2026-08-25 BY-427 피드백). */}
      <SelfStateBadge
        state={selfState ?? (member.cameraOn ? "NEUTRAL" : "OFF")}
        studySeconds={member.studySeconds}
        className="absolute top-3 left-3"
      />
      <div className="absolute bottom-3 left-3">
        <p className="text-[15px] font-bold text-white">
          {member.nickname}
          {/* 타 참가자의 집중상태는 시각 표시가 없다(명세 2026-08-21 개정 · 2026-08-25 BY-427:
              내 타일만 상태 뱃지 도입) — 보조기술에는 텍스트로 전달한다. */}
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
