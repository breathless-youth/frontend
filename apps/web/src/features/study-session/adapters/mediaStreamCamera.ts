import { reportHandled } from "@/lib/sentry";

import { visionDiagnostics } from "../vision/diagnostics";
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
 * ⚠️ 그 수동 타이머 모드는 **정책만 확정됐고 FE에는 아직 없다**(`app-review-checklist.md` 1-1,
 * 심사 제출 전 필수 · 별도 티켓). 지금 카메라가 실패하면 세션은 그냥 감지 없이 계속 돈다.
 *
 * **AI 분석용 원본 프레임·얼굴 데이터는 서버로 전송하지 않는다.** 저장·로그도 금지.
 * 예외는 멀티룸의 화면 공유뿐이다 — 이 스트림의 트랙이 P2P로 참여자에게만 전송된다
 * (서버 경유·녹화 없음, `frontend/CLAUDE.md` 개인정보 원칙).
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

/**
 * 전환 실패 후 이전 카메라 복원 재시도까지의 대기. 방금 정지한 카메라는 해제가 늦어 즉시
 * 재열기가 실패할 수 있다 — 입장 미리보기의 재획득 재시도와 같은 실측 기반 값이다.
 */
const RESTORE_RETRY_MS = 700;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 실제로 열린 트랙 설정을 진단에 남긴다 — 요청값(`cameraConstraints`)과 다를 수 있고,
 * 그 차이가 그대로 프리뷰 여백이 된다(`CameraStreamDiagnostics` 참고).
 *
 * **어떤 이유로도 던지지 않는다.** 이건 진단일 뿐인데 여기서 예외가 나면 `open()`이 통째로
 * 실패해 카메라가 안 켜진다 — 진단이 기능을 죽이는 건 어떤 값어치로도 정당화되지 않는다.
 * 그래서 `getVideoTracks`·`getSettings`의 존재를 확인하고 들어간다(테스트 스텁을 포함해
 * MediaStream 표면을 부분만 구현한 환경이 실제로 있다).
 */
function reportStreamSettings(stream: MediaStream): void {
  const track = stream.getVideoTracks?.()[0];
  if (typeof track?.getSettings !== "function") {
    return;
  }
  const settings = track.getSettings();
  const width = settings.width ?? 0;
  const height = settings.height ?? 0;
  visionDiagnostics.cameraStream({
    width,
    height,
    // 트랙이 안 주면 계산한다 — 비율이야말로 이 로그를 남기는 이유다.
    aspectRatio: settings.aspectRatio ?? (height === 0 ? 0 : width / height),
    facingMode: settings.facingMode ?? "unknown",
  });
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
      // 뷰포트 비율은 **열 때마다** 읽는다 — 기기를 돌리면 값이 뒤집히고, 카메라 전환도
      // 새로 여는 것이라 그때의 화면 모양을 반영해야 한다.
      const opened = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS[next]);
      reportStreamSettings(opened);
      return opened;
    } catch (error: unknown) {
      // 권한 거부·기기 점유 모두 여기로 온다. 어느 쪽인지 화면에서 구분하지 않으므로
      // (voice-tone에 `카메라가 꺼져 있어요` 하나뿐) 사유를 나누지 않는다.
      // Sentry에는 에러 종류(NotAllowedError 등)가 그대로 실려 사유별 빈도를 볼 수 있다(BY-372).
      reportHandled(error, "camera-acquire");
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

      const previous = facing;
      const next: CameraFacing = facing === "front" ? "back" : "front";
      // 새 카메라를 열기 **전에** 기존 스트림을 먼저 정지한다 — Android 카메라 서비스는
      // 기존 카메라를 놓기 전에는 반대 카메라 열기를 거부해, 열어 두고 전환하면 후면
      // 전환이 항상 실패했다(2026-08-25 실기기 확인). 실패 대비는 스트림을 남겨 두는
      // 방식 대신 아래 복원(이전 카메라 재열기)으로 한다.
      stopStream(stream);
      stream = null;
      let openedFacing = previous;
      pending = (async () => {
        const openedNext = await open(next);
        if (openedNext !== null) {
          openedFacing = next;
          return openedNext;
        }
        // 전환 실패 — 이전 카메라를 복원한다. 전환 실패로 프리뷰가 통째로 꺼지면 세션이
        // 측정 불가 상태가 되기 때문이다. 방금 정지한 카메라라 해제가 늦을 수 있어
        // 한 번만 잠깐 뒤 재시도한다.
        const restored = await open(previous);
        if (restored !== null) {
          return restored;
        }
        await wait(RESTORE_RETRY_MS);
        return open(previous);
      })();
      const opened = await pending;
      pending = null;
      if (!wanted) {
        // 전환 도중 stop()이 들어왔다. 기존 스트림은 위에서 이미 정지했고,
        // 뒤늦게 열린 이 스트림은 여기서 버린다 — 붙여 두면 그대로 누수다.
        stopStream(opened);
        return { ok: false, reason: "camera-off" };
      }
      if (opened === null) {
        // 복원까지 실패했다 — 카메라 없는 상태를 그대로 알린다.
        return { ok: false, reason: "camera-off" };
      }

      stream = opened;
      facing = openedFacing;
      return openedFacing === next ? { ok: true, facing } : { ok: false, reason: "no-alternative" };
    },
  };
}
