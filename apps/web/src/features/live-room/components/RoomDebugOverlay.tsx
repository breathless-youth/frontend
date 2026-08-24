import type { RoomMember } from "@focusmakers/types";

/**
 * DEV 전용 P2P 진단 오버레이
 *
 * 실기기에서 상태 평면(cam)과 미디어 평면(st)을 즉석에서 보기 위한 것.
 * 케이블 없이 쓸 수 있는 유일한 진단 수단이라 남겨 둔다(배포 빌드 제외).
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
  return (
    <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+4px)] left-2 z-20 rounded bg-black/70 p-1 font-mono text-[10px] leading-[13px] text-lime-300">
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
  );
}
