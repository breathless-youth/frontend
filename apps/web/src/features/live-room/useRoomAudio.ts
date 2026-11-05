import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { trackGroupRoomMicToggled } from "@/lib/amplitude";
import i18n from "@/lib/i18n";

import type { MicLine, MicTurnOnResult } from "./audio/micLine";
import { createMicLine } from "./audio/micLine";
import type { MicAcquireResult } from "./audio/microphone";
import { acquireMicTrack } from "./audio/microphone";
import type { RemoteAudioPlayer } from "./audio/remoteAudio";
import { createRemoteAudioPlayer } from "./audio/remoteAudio";
import type { SpeakingState } from "./audio/speaking";
import { INITIAL_SPEAKING, nextSpeaking, SPEAKING_SAMPLE_MS } from "./audio/speaking";
import type { PeerMesh } from "./peerMesh";

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

/** 보내던 마이크 트랙이 무음이 된 뒤 스스로 풀리기를 기다리는 시간 */
export const MIC_MUTE_SETTLE_MS = 1_000;

// 새로 얻은 트랙도 이 시간 안에 다시 끊기거나 무음이 되면 되풀이해 얻지 않고 마이크를 끈다.
const MIC_RENEW_RETRY_MS = 5_000;

const NO_SPEAKERS: ReadonlySet<number> = new Set();

// 터치는 누를 때가 아니라 손을 뗄 때 사용자 동작으로 인정하는 브라우저가 있어서 뗌과 클릭, 키보드도 듣는다.
const USER_ACTIVATION_EVENTS = [
  "pointerdown",
  "pointerup",
  "touchend",
  "click",
  "keydown",
] as const;

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

function micFailureNotice(result: Exclude<MicTurnOnResult, "on" | "cancelled">): string {
  return result === "denied"
    ? i18n.t("live-room:roomAudio.micDenied")
    : i18n.t("live-room:roomAudio.micUnavailable");
}

/**
 * 공부방 소리 상태
 *
 * 마이크는 꺼진 채 시작하고 카메라와 상관없이 켜고 끈다.
 * 앱을 떠나거나 세션이 끝나기 시작하면 꺼지고, 돌아와도 따라 켜지지 않아서 사용자가 켜지 않은 소리는 나가지 않는다.
 * 켜 둔 마이크의 트랙이 끊기거나 무음인 채로 남거나 통화가 끝나면 새 트랙을 얻어 모든 연결의 트랙을 바꾼다.
 * 사람별 음량과 소리 끄기는 이 기기에서만 먹히고 공부방을 나가면 사라진다.
 * 초대코드 방은 소리를 쓰지 않아서 마이크와 재생기를 만들지 않고, enabled는 처음 그릴 때 한 번만 읽는다.
 */
export function useRoomAudio({
  enabled,
  mesh,
  held,
  micOnUserIds,
  onNotice,
  acquire = acquireMicTrack,
  createPlayer = () => createRemoteAudioPlayer(),
}: {
  enabled: boolean;
  mesh: Pick<PeerMesh, "setLocalAudioTrack" | "subscribeRemoteAudio">;
  /** 앱을 떠났거나 세션이 끝나기 시작해서 마이크를 끄고 켜지 못하게 막는 동안이다. */
  held: boolean;
  /** 마이크를 켠 다른 멤버이고, 멤버 목록이 바뀔 때만 새 집합을 넘긴다. */
  micOnUserIds: ReadonlySet<number>;
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
  // 지금 보내는 마이크 트랙이고, 이 트랙이 끊기거나 무음이 되는 신호를 듣는다.
  const [sentTrack, setSentTrack] = useState<MediaStreamTrack | null>(null);
  // 마지막으로 새 트랙을 얻기 시작한 시각이다.
  const renewedAtRef = useRef<number | null>(null);

  // 막히는 렌더에서 바로 꺼짐으로 그려야 막힘이 풀릴 때 마이크가 켜짐으로 돌아오지 않는다.
  const [heldBefore, setHeldBefore] = useState(held);
  if (held !== heldBefore) {
    setHeldBefore(held);
    if (held) {
      setMicOn(false);
      setMicPending(false);
      setSentTrack(null);
    }
  }
  // 꺼짐을 그린 커밋 안에서 떼야, 그 커밋과 다음 effect 사이에 권한 창의 응답이 도착해 마이크가 실리는 일이 없다.
  useLayoutEffect(() => {
    if (!held) {
      return;
    }
    // 켜는 중이던 요청도 함께 취소돼서 막힌 뒤에 도착한 트랙은 실리지 않는다.
    line?.turnOff();
    player?.setLocalMeter(null);
    selfRef.current = INITIAL_SPEAKING;
  }, [held, line, player]);

  // 마이크가 실제로 켜지거나 꺼질 때만 계측하고 처음 꺼진 값은 보내지 않는다.
  // 앱을 떠나 따라 꺼지거나 OS가 마이크를 끊은 것도 꺼짐으로 센다.
  const trackedMicOnRef = useRef(micOn);
  useEffect(() => {
    if (trackedMicOnRef.current === micOn) {
      return;
    }
    trackedMicOnRef.current = micOn;
    trackGroupRoomMicToggled(micOn);
  }, [micOn]);

  function showMicOff() {
    player?.setLocalMeter(null);
    selfRef.current = INITIAL_SPEAKING;
    setMicOn(false);
    setMicPending(false);
    setSentTrack(null);
  }

  function turnMicOff() {
    line?.turnOff();
    showMicOff();
  }

  /**
   * 켜 둔 마이크를 새 트랙으로 바꾸기
   *
   * 새 트랙을 기다리는 동안에는 앞 트랙을 그대로 보낸다.
   * 새 트랙을 얻지 못하면 마이크 줄이 이미 꺼져 있어서 꺼짐으로 그리고 이유를 알린다.
   */
  function renewMic() {
    if (line === null || player === null) {
      return;
    }
    renewedAtRef.current = Date.now();
    void line.renew().then((result) => {
      // 끄기나 앱 떠남, 나가기, 뒤이은 바꾸기가 앞선 경우라 그쪽이 상태를 이미 정했다.
      if (result === "cancelled") {
        return;
      }
      if (result === "on") {
        const track = line.localTrack();
        player.setLocalMeter(track);
        setSentTrack(track);
        return;
      }
      showMicOff();
      onNotice(micFailureNotice(result));
    });
  }

  // 통화처럼 OS가 캡처를 끊거나 무음으로 만들면 켜짐으로 보여도 아무 소리도 가지 않아서 새 트랙으로 바꾼다.
  // 막 바꾼 트랙도 곧 같은 일을 겪으면 쓸 수 있는 마이크가 없는 것이라 되풀이하지 않고 끈 뒤 알린다.
  const onSentTrackLost = useEffectEvent((track: MediaStreamTrack, cause: "mute" | "ended") => {
    if (line === null || line.localTrack() !== track) {
      return;
    }
    // 통화 중에 얻은 트랙도 무음이라 통화가 끝나는 신호에서 바꾼다.
    if (cause === "mute" && player?.interrupted() === true) {
      return;
    }
    const renewedAt = renewedAtRef.current;
    if (renewedAt !== null && Date.now() - renewedAt < MIC_RENEW_RETRY_MS) {
      turnMicOff();
      onNotice(micFailureNotice("unavailable"));
      return;
    }
    renewMic();
  });

  // 통화나 알람을 지난 캡처는 끊김이나 무음 신호 없이 무음을 낼 수 있어서 켜 둔 마이크는 새 트랙으로 바꾼다.
  // 꺼 둔 마이크는 들고 있던 트랙을 다음 켜기에서 쓰지 않게만 한다.
  const onInterruptionEnd = useEffectEvent(() => {
    if (line === null) {
      return;
    }
    if (line.isOn) {
      renewMic();
      return;
    }
    void line.renew();
  });

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
    if (held) {
      return;
    }
    setMicPending(true);
    void line.turnOn().then((result) => {
      // 끄기나 앱 떠남, 나가기가 앞선 요청은 그쪽이 상태를 이미 정했다.
      if (result === "cancelled") {
        return;
      }
      setMicPending(false);
      if (result === "on") {
        const track = line.localTrack();
        setMicOn(true);
        player.setLocalMeter(track);
        setSentTrack(track);
        return;
      }
      onNotice(micFailureNotice(result));
    });
  }

  useEffect(() => {
    if (player === null) {
      return;
    }
    return player.onInterruptionEnd(() => onInterruptionEnd());
  }, [player]);

  useEffect(() => {
    if (sentTrack === null) {
      return;
    }
    const track = sentTrack;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const cancelSettle = () => {
      if (settle !== null) {
        clearTimeout(settle);
        settle = null;
      }
    };
    // 장치를 바꿀 때처럼 잠깐 무음이 됐다가 바로 풀리는 트랙은 기다린 뒤 다시 보고 바꾸지 않는다.
    const onMute = () => {
      cancelSettle();
      settle = setTimeout(() => {
        settle = null;
        if (track.muted) {
          onSentTrackLost(track, "mute");
        }
      }, MIC_MUTE_SETTLE_MS);
    };
    const onEnded = () => {
      cancelSettle();
      onSentTrackLost(track, "ended");
    };
    track.addEventListener("mute", onMute);
    track.addEventListener("ended", onEnded);
    // 듣기 시작하기 전에 이미 무음이 됐거나 끊긴 트랙도 같은 길로 보낸다.
    if (track.readyState === "ended") {
      onEnded();
    } else if (track.muted) {
      onMute();
    }
    return () => {
      cancelSettle();
      track.removeEventListener("mute", onMute);
      track.removeEventListener("ended", onEnded);
    };
  }, [sentTrack]);

  useEffect(() => {
    if (player === null) {
      return;
    }
    // 마이크를 켜지 않는 사람도 상대 소리를 들어야 해서 공부방을 누를 때 멈춘 재생을 깨운다.
    // 재생이 돌고 있으면 아무것도 하지 않고, 통화 뒤처럼 다시 멈추면 다음 누름이 다시 깨운다.
    // 누름을 멈추는 버튼보다 먼저 받으려고 문서의 capture 단계에서 듣는다.
    const wake = () => {
      if (player.needsResume()) {
        void player.resume();
      }
    };
    for (const type of USER_ACTIVATION_EVENTS) {
      document.addEventListener(type, wake, { capture: true });
    }
    return () => {
      for (const type of USER_ACTIVATION_EVENTS) {
        document.removeEventListener(type, wake, { capture: true });
      }
    };
  }, [player]);

  // 아무도 마이크를 켜지 않은 동안 재생기가 iOS 음악 앱을 멈추는 keep-alive를 켜지 않게 알린다.
  useEffect(() => {
    player?.setMicOnUsers(micOnUserIds);
  }, [micOnUserIds, player]);

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
