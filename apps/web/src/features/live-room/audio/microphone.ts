/**
 * 공부방 마이크 트랙 얻기
 *
 * 화면과 훅은 getUserMedia를 부르지 않고 이 함수의 결과 종류만 보고 안내를 고른다.
 * 소리는 P2P로 멤버에게만 가고, 이 파일은 트랙을 넘길 뿐 녹음하거나 저장하지 않는다.
 */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  // 스피커로 듣는 공부방이라 에코 제거가 없으면 상대 목소리가 상대에게 되돌아간다.
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export type MicAcquireResult =
  { kind: "ok"; track: MediaStreamTrack } | { kind: "denied" } | { kind: "unavailable" };

type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

// 권한 창에서 거절했거나 브라우저·웹뷰 설정이 막은 경우라 설정에서 허용하라는 안내가 맞다.
const DENIED_ERROR_NAMES: ReadonlySet<string> = new Set(["NotAllowedError", "SecurityError"]);

function browserGetUserMedia(): GetUserMedia | null {
  // 보안 컨텍스트가 아니거나 오래된 웹뷰면 mediaDevices 자체가 없다.
  const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (devices === undefined || typeof devices.getUserMedia !== "function") {
    return null;
  }
  return (constraints) => devices.getUserMedia(constraints);
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    return typeof error.name === "string" ? error.name : "";
  }
  return "";
}

export async function acquireMicTrack(getUserMedia?: GetUserMedia): Promise<MicAcquireResult> {
  const request = getUserMedia ?? browserGetUserMedia();
  if (request === null) {
    return { kind: "unavailable" };
  }
  try {
    const stream = await request({ audio: MIC_CONSTRAINTS, video: false });
    const track = stream.getAudioTracks()[0];
    return track === undefined ? { kind: "unavailable" } : { kind: "ok", track };
  } catch (error: unknown) {
    return DENIED_ERROR_NAMES.has(errorName(error)) ? { kind: "denied" } : { kind: "unavailable" };
  }
}
