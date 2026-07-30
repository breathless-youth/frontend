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
  /**
   * 진행 중인 `getUserMedia` 하나. `stream`은 **해결된 뒤에야** 채워지므로 이것 없이는
   * 동시 호출이 서로를 보지 못한다 — React 19 StrictMode의 effect 이중 실행에서
   * `start()`가 두 번 들어오면 카메라가 두 번 열리고 한쪽이 그대로 고아가 된다.
   */
  let pending: Promise<MediaStream | null> | null = null;
  /**
   * "카메라를 켜 둘 의도가 있는가". `stop()`이 이 값을 내리므로, 권한 프롬프트가 떠 있는
   * 동안 언마운트돼도 **뒤늦게 도착한 스트림**을 그 자리에서 정리할 수 있다. 이 취소 표시가
   * 없으면 `stop()`은 아직 `null`인 `stream`을 보고 아무것도 멈추지 않고, 그 뒤 해결된
   * 트랙은 누구도 잡고 있지 않은 채 살아남는다(카메라 인디케이터 점등·배터리 소모).
   */
  let wanted = false;

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
      wanted = true;
      if (stream !== null) {
        return;
      }
      if (pending !== null) {
        // 이미 여는 중이다 — 두 번째 getUserMedia를 걸지 않고 그 결과를 기다린다.
        await pending;
        return;
      }
      pending = open(facing);
      const opened = await pending;
      pending = null;
      if (!wanted || opened === null) {
        // 여는 도중 stop()이 들어왔다(= 세션 이탈). 어댑터를 아무도 들고 있지 않으므로
        // 여기서 정리하지 않으면 트랙이 영원히 살아 있다.
        stopStream(opened);
        return;
      }
      stream = opened;
    },
    stop() {
      wanted = false;
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
      if (pending !== null) {
        // 이미 다른 전환이 카메라를 여는 중이다 — 겹쳐서 열면 한쪽 스트림이 고아가 된다.
        // 진행 중인 전환의 결과를 그대로 따른다.
        const before = facing;
        await pending;
        return facing === before ? { ok: false, reason: "no-alternative" } : { ok: true, facing };
      }

      const next: CameraFacing = facing === "front" ? "back" : "front";
      pending = open(next);
      const opened = await pending;
      pending = null;
      if (opened === null) {
        // 새 카메라를 못 열었으면 기존 스트림을 그대로 둔다 — 전환 실패로 프리뷰가
        // 통째로 꺼지면 세션이 측정 불가 상태가 된다.
        return { ok: false, reason: "no-alternative" };
      }
      if (!wanted) {
        // 전환 도중 stop()이 들어왔다. 기존 스트림은 stop()이 이미 정리했고,
        // 뒤늦게 열린 이 스트림은 여기서 버린다 — 붙여 두면 그대로 누수다.
        stopStream(opened);
        return { ok: false, reason: "camera-off" };
      }

      stopStream(stream);
      stream = opened;
      facing = next;
      return { ok: true, facing };
    },
  };
}
