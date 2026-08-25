import { useState } from "react";

import type { RoomMember } from "@focusmakers/types";

/**
 * DEV 전용 P2P 진단 오버레이
 *
 * 실기기에서 상태 평면(cam)과 미디어 평면(st)을 즉석에서 보기 위한 것.
 * 케이블 없이 쓸 수 있는 유일한 진단 수단이라 남겨 둔다(배포 빌드 제외).
 *
 * 우상단 고정 + 토글 접기(2026-08-25 피드백) — 좌상단은 내 타일의 상태 뱃지와 겹치고,
 * 항상 펼쳐져 있으면 화면 확인을 가린다. 접힌 상태에서도 토글 칩은 남아 다시 펼 수 있다.
 */
export function RoomDebugOverlay({
  roomId,
  userId,
  channelStatus,
  members,
  remoteStreams,
  peerPaths,
  lines,
}: {
  roomId: number;
  userId: number;
  channelStatus: string;
  members: RoomMember[];
  remoteStreams: ReadonlyMap<number, MediaStream>;
  peerPaths: ReadonlyMap<number, string>;
  lines: string[];
}) {
  // 기본 접힘(2026-08-25 피드백) — 필요할 때만 펼쳐 본다.
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+4px)] right-2 z-20 flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label="진단 로그 토글"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="pointer-events-auto rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-[13px] text-lime-300"
      >
        {open ? "dbg ▾" : "dbg ▸"}
      </button>
      {open && (
        <div
          data-testid="room-debug-log"
          className="rounded bg-black/70 p-1 font-mono text-[10px] leading-[13px] text-lime-300"
        >
          <div>{`room:${roomId} me:${userId} ch:${channelStatus} members:${members.length}`}</div>
          <div>
            {members
              .filter((m) => m.userId !== userId)
              .map(
                (m) =>
                  `${m.userId}:cam${m.cameraOn ? 1 : 0} st${remoteStreams.has(m.userId) ? 1 : 0}` +
                  (peerPaths.has(m.userId) ? ` ${peerPaths.get(m.userId)}` : ""),
              )
              .join(" ")}
          </div>
          {lines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
