import type { IceServer } from "@focusmakers/types";

import type { RoomChannel } from "./roomChannel";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";

/** 룸 라우트가 router state로 받는 입장 정보 */
export type LiveRoomLocationState = {
  inviteCode: string;
  graceRejoin?: boolean;
  cameraOn?: boolean | null;
  iceServers?: IceServer[];
};

export function isLiveRoomState(state: unknown): state is LiveRoomLocationState {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof (state as LiveRoomLocationState).inviteCode === "string"
  );
}

export type CreateChannel = (options: { roomId: number; userId: number }) => RoomChannel;
export type CreateCamera = () => CameraAdapter;
