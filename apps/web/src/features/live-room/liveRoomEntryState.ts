import type { IceServer } from "@focusmakers/types";

import type { RoomChannel } from "./roomChannel";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";

/** 룸 라우트가 router state로 받는 입장 정보 */
export type LiveRoomLocationState = {
  inviteCode: string;
  graceRejoin?: boolean;
  iceServers?: IceServer[];
};

export function isLiveRoomState(state: unknown): state is LiveRoomLocationState {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof (state as LiveRoomLocationState).inviteCode === "string"
  );
}

/** 그룹 홈이 자리를 잡고 공부방 라우트로 넘기는 입장 정보 */
export type GroupRoomLocationState = {
  initialSubjectId?: number;
  initialSubjectVerified?: { userId: number; subjectId: number; validUntil: number };
  roomId: number;
  graceRejoin: boolean;
  iceServers: IceServer[];
};

export function isGroupRoomState(state: unknown): state is GroupRoomLocationState {
  if (typeof state !== "object" || state === null) {
    return false;
  }
  const value = state as Record<string, unknown>;
  return (
    typeof value.roomId === "number" &&
    (value.initialSubjectId === undefined ||
      (typeof value.initialSubjectId === "number" &&
        Number.isSafeInteger(value.initialSubjectId) &&
        value.initialSubjectId > 0)) &&
    (value.initialSubjectVerified === undefined ||
      (typeof value.initialSubjectVerified === "object" &&
        value.initialSubjectVerified !== null &&
        Number.isSafeInteger((value.initialSubjectVerified as Record<string, unknown>).userId) &&
        Number.isSafeInteger((value.initialSubjectVerified as Record<string, unknown>).subjectId) &&
        typeof (value.initialSubjectVerified as Record<string, unknown>).validUntil ===
          "number")) &&
    typeof value.graceRejoin === "boolean" &&
    Array.isArray(value.iceServers)
  );
}

export type CreateChannel = (options: {
  roomId: number;
  userId: number;
  onSnapshotUnrecovered?: () => void;
}) => RoomChannel;
export type CreateCamera = () => CameraAdapter;
