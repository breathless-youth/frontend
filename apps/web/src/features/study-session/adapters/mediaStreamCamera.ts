import { CAMERA_CONSTRAINTS } from "../vision/visionConfig";
import type { CameraAdapter, CameraFacing, CameraFlipResult } from "./cameraAdapter";

/**
 * `getUserMedia` 기반 실제 카메라 어댑터.
 *
 * 기존 `CameraAdapter` 인터페이스를 그대로 구현하므로 **화면·훅은 한 줄도 바뀌지 않는다** —
 * `useStudyRoomSession(userId, { camera })`에 주입만 하면 된다.
 *
 * `start()`가 실패해도 **던지지 않는다.** mock 어댑터의 `failToStart`와 동일한 계약이며,
 * 훅이 `camera.isRunning`을 보고 프리뷰 서피스를 결정한다. 권한 거부는 예외가 아니라
 * 정상 시나리오다(권한 거부 시 수동 타이머 모드 — mvp-scope 2026-07-26).
 *
 * **원본 프레임은 이 객체 밖으로 나가지 않는다.** `stream`은 같은 문서의 `<video>`에
 * 붙이는 용도로만 노출하며, 저장·전송·로그 어디에도 쓰지 않는다(`frontend/CLAUDE.md`).
 */
export interface MediaStreamCameraAdapter extends CameraAdapter {
  readonly stream: MediaStream | null;
}

async function countVideoInputs(): Promise<number> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput").length;
}

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

export function createMediaStreamCameraAdapter(): MediaStreamCameraAdapter {
  let facing: CameraFacing = "front";
  let stream: MediaStream | null = null;

  async function open(next: CameraFacing): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS[next]);
    } catch (error: unknown) {
      // 권한 거부·기기 점유 모두 여기로 온다. 어느 쪽인지 화면에서 구분하지 않으므로
      // (voice-tone에 `카메라가 꺼져 있어요` 하나뿐) 사유를 나누지 않는다.
      console.warn("[camera] getUserMedia 실패", error);
      return null;
    }
  }

  return {
    get facing() {
      return facing;
    },
    get isRunning() {
      return stream !== null;
    },
    get stream() {
      return stream;
    },
    async start() {
      if (stream !== null) {
        return;
      }
      stream = await open(facing);
    },
    stop() {
      stopStream(stream);
      stream = null;
    },
    async flip(): Promise<CameraFlipResult> {
      if (stream === null) {
        return { ok: false, reason: "camera-off" };
      }
      if ((await countVideoInputs()) < 2) {
        return { ok: false, reason: "no-alternative" };
      }

      const next: CameraFacing = facing === "front" ? "back" : "front";
      const opened = await open(next);
      if (opened === null) {
        // 새 카메라를 못 열었으면 기존 스트림을 그대로 둔다 — 전환 실패로 프리뷰가
        // 통째로 꺼지면 세션이 측정 불가 상태가 된다.
        return { ok: false, reason: "no-alternative" };
      }

      stopStream(stream);
      stream = opened;
      facing = next;
      return { ok: true, facing };
    },
  };
}
