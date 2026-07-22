/**
 * 멀티 종일룸의 WebRTC(LiveKit) 어댑터 경계. UI는 이 인터페이스만 알고,
 * LiveKit SDK 객체를 직접 다루지 않는다. Vision AI 분석 경로와 독립이다.
 */
export interface RoomConnectInput {
  serverUrl: string;
  token: string;
}

export interface RoomMediaController {
  connect(input: RoomConnectInput): Promise<void>;
  disconnect(): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  switchCamera(): Promise<void>;
}

/**
 * 방 접속 토큰 발급 경계. 실제 토큰은 백엔드가 발급한다.
 * 공개 토큰 하드코딩·개발용 고정 토큰 커밋 금지.
 */
export interface RoomTokenIssuer {
  issueToken(input: { roomId: string; identity: string }): Promise<RoomConnectInput>;
}
