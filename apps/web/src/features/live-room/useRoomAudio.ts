import { useEffect, useRef, useState } from "react";

import type { MicLine } from "./audio/micLine";
import { createMicLine } from "./audio/micLine";
import type { MicAcquireResult } from "./audio/microphone";
import { acquireMicTrack } from "./audio/microphone";
import type { RemoteAudioPlayer } from "./audio/remoteAudio";
import { createRemoteAudioPlayer } from "./audio/remoteAudio";
import type { SpeakingState } from "./audio/speaking";
import { INITIAL_SPEAKING, nextSpeaking, SPEAKING_SAMPLE_MS } from "./audio/speaking";
import type { PeerMesh } from "./peerMesh";

export const MIC_NEEDS_CAMERA_COPY = "카메라를 켜면 마이크를 쓸 수 있어요";
export const MIC_DENIED_COPY = "설정에서 마이크 권한을 허용해 주세요";
export const MIC_UNAVAILABLE_COPY = "마이크를 켤 수 없어요";

export interface RoomAudio {
  micOn: boolean;
  /** 권한 창이나 마이크 준비를 기다리는 중이다. */
  micPending: boolean;
  toggleMic(): void;
  othersMuted: boolean;
  toggleOthersMuted(): void;
  volumeOf(userId: number): number;
  setVolume(userId: number, volume: number): void;
  isMuted(userId: number): boolean;
  setMuted(userId: number, muted: boolean): void;
  speakingUserIds: ReadonlySet<number>;
  selfSpeaking: boolean;
}

/** 테스트와 개발용 화면이 마이크 얻기와 재생기를 바꿔 끼우는 자리 */
export interface RoomAudioDeps {
  acquire?: () => Promise<MicAcquireResult>;
  createPlayer?: () => RemoteAudioPlayer;
}

const NO_SPEAKERS: ReadonlySet<number> = new Set();

function sameMembers(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const userId of a) {
    if (!b.has(userId)) {
      return false;
    }
  }
  return true;
}

/**
 * 공부방 소리 상태
 *
 * 마이크는 꺼진 채 시작하고, 카메라가 꺼진 동안에는 켜지지 않으며 카메라가 꺼지면 함께 꺼진다.
 * 카메라를 다시 켜도 마이크는 따라 켜지지 않아서 사용자가 켜지 않은 소리는 나가지 않는다.
 * 사람별 음량과 소리 끄기는 이 기기에서만 먹히고 공부방을 나가면 사라진다.
 * 초대코드 방은 소리를 쓰지 않아서 마이크와 재생기를 만들지 않고, enabled는 처음 그릴 때 한 번만 읽는다.
 */
export function useRoomAudio({
  enabled,
  mesh,
  cameraHeld,
  onNotice,
  acquire = acquireMicTrack,
  createPlayer = () => createRemoteAudioPlayer(),
}: {
  enabled: boolean;
  mesh: Pick<PeerMesh, "setLocalAudioTrack" | "subscribeRemoteAudio">;
  /** 카메라를 꺼서 측정을 멈춘 동안이다. */
  cameraHeld: boolean;
  onNotice: (message: string) => void;
} & RoomAudioDeps): RoomAudio {
  // 채널, 카메라와 같은 지연 초기화라 다시 그려도 마이크 줄과 재생기는 공부방 수명 동안 하나다.
  const [line] = useState<MicLine | null>(() =>
    enabled ? createMicLine({ sink: mesh, acquire }) : null,
  );
  const [player] = useState<RemoteAudioPlayer | null>(() => (enabled ? createPlayer() : null));
  const [micOn, setMicOn] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [othersMuted, setOthersMuted] = useState(false);
  const [volumes, setVolumes] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [mutedIds, setMutedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [speakingUserIds, setSpeakingUserIds] = useState<ReadonlySet<number>>(NO_SPEAKERS);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  // 100ms마다 읽고 쓰는 판정 값이라 그릴 때마다 바뀌지 않게 ref에 둔다.
  const speakingRef = useRef(new Map<number, SpeakingState>());
  const selfRef = useRef<SpeakingState>(INITIAL_SPEAKING);
  // 마지막으로 화면에 넘긴 값이고, 이 값과 다를 때만 상태를 바꿔 100ms마다 다시 그리지 않게 한다.
  const shownRef = useRef<{ speakers: ReadonlySet<number>; self: boolean }>({
    speakers: NO_SPEAKERS,
    self: false,
  });
  const watchedRef = useRef(new WeakSet<MediaStreamTrack>());

  // 카메라가 꺼지는 렌더에서 바로 꺼짐으로 그려야 카메라를 다시 켤 때 마이크가 켜짐으로 돌아오지 않는다.
  const [heldBefore, setHeldBefore] = useState(cameraHeld);
  if (cameraHeld !== heldBefore) {
    setHeldBefore(cameraHeld);
    if (cameraHeld) {
      setMicOn(false);
      setMicPending(false);
    }
  }
  useEffect(() => {
    if (!cameraHeld) {
      return;
    }
    // 켜는 중이던 요청도 함께 취소돼서 카메라가 꺼진 뒤에 도착한 트랙은 실리지 않는다.
    line?.turnOff();
    player?.setLocalMeter(null);
    selfRef.current = INITIAL_SPEAKING;
  }, [cameraHeld, line, player]);

  function turnMicOff() {
    line?.turnOff();
    player?.setLocalMeter(null);
    selfRef.current = INITIAL_SPEAKING;
    setMicOn(false);
    setMicPending(false);
  }

  // 통화처럼 OS가 마이크를 끊으면 트랙이 끝나는데, 켜짐으로 남기면 아무 소리도 가지 않는 마이크가 켜져 보인다.
  function watchEnded(track: MediaStreamTrack) {
    if (watchedRef.current.has(track)) {
      return;
    }
    watchedRef.current.add(track);
    track.addEventListener("ended", () => {
      if (line?.localTrack() === track) {
        turnMicOff();
      }
    });
  }

  function toggleMic() {
    if (line === null || player === null) {
      return;
    }
    // 마이크 버튼은 사용자 동작이라 상대 소리 재생도 여기서 함께 깨운다.
    void player.resume();
    if (micOn || micPending) {
      turnMicOff();
      return;
    }
    if (cameraHeld) {
      onNotice(MIC_NEEDS_CAMERA_COPY);
      return;
    }
    setMicPending(true);
    void line.turnOn().then((result) => {
      // 끄기나 카메라 꺼짐, 나가기가 앞선 요청은 그쪽이 상태를 이미 정했다.
      if (result === "cancelled") {
        return;
      }
      setMicPending(false);
      if (result === "on") {
        const track = line.localTrack();
        setMicOn(true);
        player.setLocalMeter(track);
        if (track !== null) {
          watchEnded(track);
        }
        return;
      }
      onNotice(result === "denied" ? MIC_DENIED_COPY : MIC_UNAVAILABLE_COPY);
    });
  }

  useEffect(() => {
    if (player === null) {
      return;
    }
    // 마이크를 켜지 않는 사람도 상대 소리를 들어야 해서 공부방을 처음 누를 때 재생을 깨운다.
    // 누름을 멈추는 버튼보다 먼저 받으려고 문서의 capture 단계에서 듣는다.
    const wake = () => {
      void player.resume();
    };
    document.addEventListener("pointerdown", wake, { capture: true, once: true });
    return () => {
      document.removeEventListener("pointerdown", wake, { capture: true });
    };
  }, [player]);

  useEffect(() => {
    if (player === null) {
      return;
    }
    const speaking = speakingRef.current;
    return mesh.subscribeRemoteAudio((userId, track) => {
      if (track === null) {
        player.detach(userId);
        speaking.delete(userId);
        return;
      }
      player.attach(userId, track);
      if (!speaking.has(userId)) {
        speaking.set(userId, INITIAL_SPEAKING);
      }
    });
  }, [mesh, player]);

  useEffect(() => {
    if (player === null) {
      return;
    }
    const speaking = speakingRef.current;
    const shown = shownRef.current;
    const timer = setInterval(() => {
      const speakers = new Set<number>();
      for (const [userId, state] of speaking) {
        const next = nextSpeaking(state, player.level(userId));
        speaking.set(userId, next);
        if (next.speaking) {
          speakers.add(userId);
        }
      }
      if (!sameMembers(shown.speakers, speakers)) {
        shown.speakers = speakers;
        setSpeakingUserIds(speakers);
      }
      selfRef.current = nextSpeaking(selfRef.current, player.localLevel());
      if (selfRef.current.speaking !== shown.self) {
        shown.self = selfRef.current.speaking;
        setSelfSpeaking(shown.self);
      }
    }, SPEAKING_SAMPLE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [player]);

  useEffect(() => {
    const speaking = speakingRef.current;
    return () => {
      line?.close();
      player?.close();
      speaking.clear();
    };
  }, [line, player]);

  return {
    micOn,
    micPending,
    toggleMic,
    othersMuted,
    toggleOthersMuted() {
      if (player === null) {
        return;
      }
      const next = !othersMuted;
      setOthersMuted(next);
      player.setAllMuted(next);
    },
    volumeOf: (userId) => volumes.get(userId) ?? 1,
    setVolume(userId, volume) {
      if (player === null) {
        return;
      }
      const clamped = Math.min(1, Math.max(0, volume));
      setVolumes((previous) => new Map(previous).set(userId, clamped));
      player.setVolume(userId, clamped);
    },
    isMuted: (userId) => mutedIds.has(userId),
    setMuted(userId, muted) {
      if (player === null) {
        return;
      }
      setMutedIds((previous) => {
        const next = new Set(previous);
        if (muted) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
      player.setMuted(userId, muted);
    },
    speakingUserIds,
    // 마이크가 꺼진 동안 내 소리는 상대에게 가지 않아서 말하는 중으로 보이지 않는다.
    selfSpeaking: micOn && selfSpeaking,
  };
}
