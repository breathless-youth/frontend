import type { RoomMediaController, RoomTokenIssuer } from "./types";

/**
 * 실제 LiveKit 연결 없이 상태만 추적하는 mock. 실제 구현은 기술 스파이크에서
 * LiveKit RN/Expo 어댑터로 교체한다(Expo SDK 57 네이티브 호환성 검증 후).
 */
export function createMockRoomMediaController(): RoomMediaController {
  const state = {
    connected: false,
    cameraEnabled: true,
    facing: "front" as "front" | "back",
    serverUrl: "",
  };

  return {
    async connect(input) {
      state.connected = true;
      state.serverUrl = input.serverUrl;
    },
    async disconnect() {
      state.connected = false;
    },
    async setCameraEnabled(enabled) {
      state.cameraEnabled = enabled;
    },
    async switchCamera() {
      state.facing = state.facing === "front" ? "back" : "front";
    },
  };
}

/**
 * 개발용 mock 토큰 발급기. 런타임에 가짜 토큰 문자열을 만들 뿐 실제 토큰이 아니며,
 * 소스에 고정 토큰을 커밋하지 않는다. 실제 발급은 백엔드로 대체한다.
 */
export function createMockRoomTokenIssuer(): RoomTokenIssuer {
  return {
    async issueToken({ roomId, identity }) {
      return {
        serverUrl: "wss://mock.livekit.local",
        token: `mock-token:${roomId}:${identity}`,
      };
    },
  };
}
