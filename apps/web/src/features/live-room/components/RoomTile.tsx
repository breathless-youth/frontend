import type { ReactNode, Ref } from "react";

import type { RoomMember } from "@focusmakers/types";

import { normalizeGoal } from "@/features/profile/profileValidation";
import { cn } from "@/lib/utils";

import { formatStudyHhMm } from "../roomGrid";
import { RoomAvatarFallback } from "./RoomAvatarFallback";

/**
 * UI
 * 룸 멤버 타일
 */

type TileBadgeState = "FOCUS" | "DISTRACTED" | "OFF";

const TILE_BADGE_SPEC: Record<TileBadgeState, { label: string; border: string }> = {
  FOCUS: { label: "집중 중", border: "border-(--state-focus)" },
  DISTRACTED: { label: "휴식", border: "border-(--state-distract)" },
  OFF: { label: "카메라 꺼짐", border: "border-(--text-tertiary)" },
};

/**
 * 상대 타일 순공 시간 뱃지
 *
 * 값은 서버가 보낸 순공 시간 그대로이고 기기에서 이어 세지 않는다.
 * 색만으로 상태를 전하지 않도록 상태 문구를 sr-only로 함께 둔다.
 */
function TileTimeBadge({
  state,
  focusSec,
  className,
}: {
  state: TileBadgeState;
  focusSec: number | undefined;
  className?: string;
}) {
  const spec = TILE_BADGE_SPEC[state];
  return (
    <div
      data-testid="tile-time-badge"
      data-state={state}
      className={cn(
        "inline-flex items-center rounded-full border-[1.5px] bg-[#101419]/68 px-3 py-1.25 backdrop-blur-[5px] regular:px-3.5 regular:py-1.5 short-side-lg:px-4.5 short-side-lg:py-2",
        spec.border,
        className,
      )}
    >
      <span className="text-[13px] leading-4 font-bold text-white tabular-nums regular:text-base regular:leading-5 short-side-lg:text-xl short-side-lg:leading-6.25">
        {focusSec === undefined ? "--:--" : formatStudyHhMm(focusSec)}
      </span>
      <span className="sr-only"> {spec.label}</span>
    </div>
  );
}

type RoomTileProps = {
  member: RoomMember;
  /** 배경 미디어(내 타일의 로컬 카메라). 없거나 카메라 끔이면 아바타를 그린다. */
  media?: ReactNode;
  /** 내 타일이면 뱃지를 그리지 않는다. 내 시간은 화면 왼쪽 위 글자로 보여 준다. */
  isSelf?: boolean;
  /** 내 타일에만 넘긴다 — 카메라 켜기 모달이 미리보기 비율을 맞추려고 타일 박스를 잰다. */
  rootRef?: Ref<HTMLDivElement>;
  className?: string;
};

export function RoomTile({ member, media, isSelf = false, rootRef, className }: RoomTileProps) {
  const showMedia = member.cameraOn && media !== undefined;
  // 지운 목표는 서버에 빈 문자열로 남으므로 빈 줄을 그리지 않게 미설정으로 맞춘다.
  const goal = normalizeGoal(member.goal);
  return (
    <div
      ref={rootRef}
      data-testid="room-tile"
      data-user-id={member.userId}
      data-state={member.cameraOn ? member.focusState : "OFF"}
      className={`relative overflow-hidden rounded-xl bg-(--session-dialog-bg) ${className ?? ""}`}
    >
      {showMedia ? (
        <div className="absolute inset-0">{media}</div>
      ) : (
        <RoomAvatarFallback nickname={member.nickname} scaleWithTile />
      )}
      {showMedia && (
        /* 영상 위 텍스트 가독성용 하단 스크림 */
        <div
          aria-hidden="true"
          data-testid="tile-scrim"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-19 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_100%)]"
        />
      )}
      {!isSelf && (
        <TileTimeBadge
          state={
            member.cameraOn ? (member.focusState === "DISTRACTED" ? "DISTRACTED" : "FOCUS") : "OFF"
          }
          focusSec={member.focusSec}
          className="absolute top-2.5 right-2.5"
        />
      )}
      {/* 좁은 타일에서 줄이 늘면 영상을 가리므로 이름과 목표는 각각 한 줄로 줄인다. */}
      <div data-testid="tile-info" className="absolute right-3 bottom-3 left-3">
        <p className="truncate text-[15px] font-bold text-white regular:text-[1.0625rem] short-side-lg:text-[1.3125rem]">
          {member.nickname}
        </p>
        {goal !== null && (
          <p className="mt-1 truncate text-xs leading-3.75 text-white/72 regular:text-sm regular:leading-4.5 short-side-lg:text-[1.0625rem] short-side-lg:leading-5.5">
            {goal}
          </p>
        )}
      </div>
    </div>
  );
}
