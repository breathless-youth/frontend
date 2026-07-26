/**
 * 카메라 어댑터 — **인터페이스 + mock만** 있다.
 *
 * 실기기 기술 스파이크가 끝나기 전에는 `getUserMedia`/MediaPipe/LiveKit 등 어떤 SDK도
 * 설치·호출하지 않는다(`frontend/CLAUDE.md` "하지 말 것"). UI 컴포넌트는 이 인터페이스만 보고,
 * 실제 구현체는 스파이크 이후 별도 티켓에서 붙인다.
 */

export type CameraFacing = "front" | "back";

export type CameraFlipResult =
  | { readonly ok: true; readonly facing: CameraFacing }
  /** no-alternative = 전환할 카메라가 없음 / camera-off = 카메라가 꺼져 있음(토스트 문구가 갈린다). */
  | { readonly ok: false; readonly reason: "no-alternative" | "camera-off" };

export interface CameraAdapter {
  readonly facing: CameraFacing;
  readonly isRunning: boolean;
  start(): Promise<void>;
  stop(): void;
  flip(): Promise<CameraFlipResult>;
}

export interface MockCameraOptions {
  /** 기기가 가진 카메라 목록. 1개면 전환이 실패한다. */
  readonly availableFacings?: readonly CameraFacing[];
  /** start()가 실패하는 상황(권한 거부 등)을 재현한다. */
  readonly failToStart?: boolean;
}

/**
 * 개발·테스트용 mock. 실제 카메라 피드는 없고 상태 전이만 흉내낸다 —
 * 화면은 `CameraPreviewSurface`가 "카메라 피드가 들어올 자리"를 중립 서피스로 그린다.
 */
export function createMockCameraAdapter(options: MockCameraOptions = {}): CameraAdapter {
  const availableFacings = options.availableFacings ?? (["front", "back"] as const);
  let facing: CameraFacing = availableFacings[0] ?? "front";
  let running = false;

  return {
    get facing() {
      return facing;
    },
    get isRunning() {
      return running;
    },
    async start() {
      if (options.failToStart === true) {
        running = false;
        return;
      }
      running = true;
    },
    stop() {
      running = false;
    },
    async flip() {
      if (!running) {
        return { ok: false, reason: "camera-off" };
      }
      if (availableFacings.length < 2) {
        return { ok: false, reason: "no-alternative" };
      }
      const nextIndex = (availableFacings.indexOf(facing) + 1) % availableFacings.length;
      facing = availableFacings[nextIndex] ?? facing;
      return { ok: true, facing };
    },
  };
}
