import type { MicAcquireResult } from "./microphone";

/**
 * 마이크를 끄는 방식
 *
 * 마이크를 끄는 방식은 이 상수 한 곳에서만 고르고, 다른 파일은 track.enabled나 replaceTrack(null)로 마이크를 끄지 않는다.
 * disable은 트랙을 송신기에 둔 채 enabled만 꺼서 다시 켜기가 가장 빠르지만, 끈 동안에도 무음 패킷이 초당 약 50개씩 나간다.
 * detach는 모든 송신기에서 트랙을 떼어 패킷이 나가지 않고 같은 트랙을 바로 다시 붙이지만, 캡처가 열려 있어 OS 마이크 표시가 남는다.
 * stop은 떼어 낸 트랙을 멈춰 OS 마이크 표시까지 꺼지지만, 다시 켤 때마다 새 트랙을 얻느라 기기에 따라 수백 ms가 걸린다.
 * TURN 서버의 한계가 초당 패킷 수라서 끄면 아무것도 보내지 않기로 했고, 근거와 측정값은 ADR 0020에 있다.
 * detach와 stop 중에서는 다시 켜기가 빠른 detach로 정했고, 끈 동안 OS 마이크 표시가 남는 것은 디스코드 같은 앱처럼 받아들인다.
 */
export type MicOffMode = "disable" | "detach" | "stop";
export const MIC_OFF_MODE: MicOffMode = "detach";

export type MicTurnOnResult = "on" | "denied" | "unavailable" | "cancelled";

/** 마이크 트랙을 받아 모든 연결의 소리 송신기에 싣는 쪽 */
export interface MicSink {
  setLocalAudioTrack(track: MediaStreamTrack | null): void;
}

export interface MicLine {
  readonly isOn: boolean;
  /** 켜는 사이에 끄거나 닫으면 늦게 온 트랙을 싣지 않고 cancelled로 끝난다. */
  turnOn(): Promise<MicTurnOnResult>;
  turnOff(): void;
  /**
   * 소리를 내지 못하는 트랙을 새 트랙으로 바꾸기
   *
   * 켜져 있으면 새 트랙을 얻어 모든 송신기에 싣고 앞 트랙을 멈춘다.
   * 새 트랙을 얻지 못하면 앞 트랙도 떼고 멈춰 꺼진 채 그 이유로 끝난다.
   * 꺼져 있으면 들고 있던 트랙을 다음 켜기에서 쓰지 않게만 하고 cancelled로 끝난다.
   * 바꾸는 사이에 끄거나 닫거나 다시 바꾸면 늦게 온 트랙을 싣지 않고 cancelled로 끝난다.
   */
  renew(): Promise<MicTurnOnResult>;
  /** 어느 방식이든 송신기에서 떼고 트랙을 멈추며, 닫은 뒤에 다시 켜면 새 트랙을 얻는다. */
  close(): void;
  /** 지금 보내고 있는 트랙이고, 꺼져 있으면 null이다. */
  localTrack(): MediaStreamTrack | null;
}

/**
 * 공부방 마이크 송신 줄
 *
 * 켜기 요청마다 세대 번호를 올려서, 권한 창을 기다리는 사이 끄거나 닫으면 늦게 온 트랙을 싣지 않고 멈춘다.
 * 이 취소가 없으면 사용자가 끄거나 앱을 떠난 뒤에 도착한 트랙이 실려 동의 없이 소리가 나간다.
 * 트랙을 바꿀 때는 새 트랙을 먼저 싣고 앞 트랙을 멈춰서 바꾸는 동안 소리가 비지 않는다.
 */
export function createMicLine({
  sink,
  acquire,
  mode = MIC_OFF_MODE,
}: {
  sink: MicSink;
  acquire: () => Promise<MicAcquireResult>;
  mode?: MicOffMode;
}): MicLine {
  // detach와 disable은 꺼져도 트랙을 들고 있다가 다시 켤 때 쓰고, stop은 끌 때 버린다.
  let track: MediaStreamTrack | null = null;
  // 소리를 내지 못한다는 신호를 받은 트랙이라 들고 있어도 다시 켤 때 쓰지 않는다.
  let stale = false;
  let on = false;
  let generation = 0;
  let pending: Promise<MicTurnOnResult> | null = null;

  function canReuse(current: MediaStreamTrack | null): current is MediaStreamTrack {
    // OS가 끊었거나 무음으로 만든 트랙을 다시 실으면 켜진 것처럼 보여도 아무 소리도 가지 않는다.
    return (
      current !== null &&
      mode !== "stop" &&
      !stale &&
      current.readyState === "live" &&
      !current.muted
    );
  }

  async function acquireSafely(): Promise<MicAcquireResult> {
    try {
      return await acquire();
    } catch {
      return { kind: "unavailable" };
    }
  }

  function release(): void {
    if (track === null) {
      return;
    }
    const releasing = track;
    track = null;
    stale = false;
    sink.setLocalAudioTrack(null);
    releasing.stop();
  }

  async function acquireAndAttach(requested: number): Promise<MicTurnOnResult> {
    const result = await acquireSafely();
    if (requested !== generation) {
      if (result.kind === "ok") {
        result.track.stop();
      }
      return "cancelled";
    }
    pending = null;
    if (result.kind !== "ok") {
      // 켜 둔 채 바꾸다 실패하면 소리를 내지 못하는 앞 트랙을 켜진 것처럼 남기지 않는다.
      if (on) {
        on = false;
        release();
      }
      return result.kind;
    }
    const previous = track;
    track = result.track;
    stale = false;
    sink.setLocalAudioTrack(track);
    on = true;
    if (previous !== null && previous !== track) {
      previous.stop();
    }
    return "on";
  }

  return {
    get isOn() {
      return on;
    },
    turnOn() {
      if (on) {
        return Promise.resolve("on");
      }
      if (pending !== null) {
        return pending;
      }
      if (canReuse(track)) {
        if (mode === "disable") {
          track.enabled = true;
        } else {
          sink.setLocalAudioTrack(track);
        }
        on = true;
        return Promise.resolve("on");
      }
      generation += 1;
      pending = acquireAndAttach(generation);
      return pending;
    },
    turnOff() {
      generation += 1;
      pending = null;
      if (!on) {
        return;
      }
      on = false;
      if (track === null) {
        return;
      }
      if (mode === "disable") {
        track.enabled = false;
        return;
      }
      sink.setLocalAudioTrack(null);
      if (mode === "stop") {
        track.stop();
        track = null;
      }
    },
    renew() {
      stale = track !== null;
      if (!on) {
        return Promise.resolve("cancelled");
      }
      generation += 1;
      pending = acquireAndAttach(generation);
      return pending;
    },
    close() {
      generation += 1;
      pending = null;
      on = false;
      release();
    },
    localTrack() {
      return on ? track : null;
    },
  };
}
