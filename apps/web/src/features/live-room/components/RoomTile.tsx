import type { ReactNode } from "react";

import type { RoomMember } from "@focusmakers/types";

import { formatStudyHhMm } from "../roomGrid";

/**
 * 룸 멤버 타일
 *
 * 타일 서피스는 라이트 모드에서도 다크 고정(명세 S8-1 방식 — 카메라 피드가 어두워서).
 * 탭 동작 없음(케밥·드로어 제거 확정). P2P 실패 표시는 카메라 끔과 동일(3단계에서 사용).
 */
type RoomTileProps = {
  member: RoomMember;
  /** 배경 미디어(내 타일의 로컬 카메라). 없거나 카메라 끔이면 아바타를 그린다. */
  media?: ReactNode;
  className?: string;
};

export function RoomTile({ member, media, className }: RoomTileProps) {
  const showMedia = member.cameraOn && media !== undefined;
  return (
    <div
      data-testid="room-tile"
      data-user-id={member.userId}
      data-state={member.cameraOn ? member.focusState : "OFF"}
      className={`relative overflow-hidden rounded-3xl bg-[#191f28] ${className ?? ""}`}
    >
      {showMedia ? (
        <div className="absolute inset-0">{media}</div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-white/10">
            <span className="text-xl font-bold text-white">{member.nickname.charAt(0)}</span>
          </div>
        </div>
      )}
      <p
        className={`absolute top-3.5 left-4 text-[15px] font-bold ${
          member.cameraOn ? "text-white" : "text-text-tertiary"
        }`}
      >
        {formatStudyHhMm(member.studySeconds)}
      </p>
      <div className="absolute bottom-3 left-3">
        <p className="text-[15px] font-bold text-white">
          {member.nickname}
          {/* 집중상태는 시각 표시가 없다(명세 2026-08-21 개정) — 보조기술에는 텍스트로 전달한다. */}
          <span className="sr-only">
            {member.cameraOn
              ? member.focusState === "FOCUS"
                ? " 집중 중"
                : " 비집중"
              : " 카메라 꺼짐"}
          </span>
        </p>
        {member.goal !== null && (
          <p className="mt-1 text-xs leading-[15px] text-white/72">{member.goal}</p>
        )}
      </div>
    </div>
  );
}
