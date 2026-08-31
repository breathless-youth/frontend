import type { RoomSignalKind, RtcStatRequest } from "@focusmakers/types";

import type { RoomChannel } from "./roomChannel";

/**
 * P2P 풀메시 오케스트레이션 — 연결 수립·영상 트랙·정리를 전담
 *
 * glare 방지: SNAPSHOT 수신자(신규 입장자)만 offer를 만들고, 기존 멤버는 상대의 offer를
 * 받아 answer만 한다.
 *
 * 시그널은 채널로만 오간다. 이 모듈은 STOMP를 모르고, 채널은 WebRTC를 모른다
 */
export type CreatePeerConnection = (config: RTCConfiguration) => RTCPeerConnection;

export interface PeerMesh {
  /** 채널 구독 시작. close 후 다시 불러도 된다 — React 수명(마운트 effect)에 묶는다. */
  start(): void;
  setLocalStream(stream: MediaStream | null): void;
  setTrackEnabled(enabled: boolean): void;
  /**
   * 모든 P2P 연결을 폐기한다(구독·로컬 스트림은 유지) — 백그라운드 복귀 재구축용.
   * 배경에서는 소켓·TURN 임대·인코더가 제각각 죽어 계층별 소생이 조합 폭발이라
   * 신뢰할 수 없었다(2026-08-26 실기기: ICE 재시작만으로는 prflx 경로·검은 화면
   * 혼재). 폐기 후 채널 재연결의 새 SNAPSHOT이 전원 재offer를 트리거해 TURN 임대·
   * 인코더·디코더가 전부 새로 만들어진다. 상대측의 낡은 PC는 DTLS 지문이 다른 offer
   * 판정(handleSignal의 new-pc 분기)이 폐기시켜 그쪽도 새 연결로 answer한다.
   */
  resetConnections(): void;
  subscribeRemoteStreams(
    listener: (userId: number, stream: MediaStream | null) => void,
  ): () => void;
  close(): void;
}

function defaultCreatePeerConnection(config: RTCConfiguration): RTCPeerConnection {
  return new RTCPeerConnection(config);
}

export function createPeerMesh({
  myUserId,
  roomId,
  channel,
  iceServers,
  createPeerConnection = defaultCreatePeerConnection,
  onEvent,
  reportStats,
}: {
  myUserId: number;
  roomId: number;
  channel: RoomChannel;
  iceServers: RTCIceServer[];
  createPeerConnection?: CreatePeerConnection;
  onEvent?: (line: string) => void;
  reportStats?: (payload: RtcStatRequest) => void;
}): PeerMesh {
  const peers = new Map<number, RTCPeerConnection>();
  const restartAttempted = new Set<number>();
  // 내가 offer를 만든 상대 — ICE 재시작 offer도 이쪽만 만든다. 양쪽이 동시에 재시작
  // offer를 내면 최초 수립 때 피했던 glare가 재협상에서 되살아난다.
  const offeredByMe = new Set<number>();
  // 마지막으로 통지한 스트림 — ICE가 disconnected로 잠깐 끊겼다 돌아오면 되살린다.
  const lastStreams = new Map<number, MediaStream>();
  // 상대별 시그널 처리 체인 — SDP 적용이 끝나기 전에 후속 CANDIDATE가 병렬로 들어와
  // 실패·폐기되지 않도록 같은 상대의 시그널은 도착 순서대로 하나씩 처리한다.
  const signalChains = new Map<number, Promise<void>>();
  // 신규 입장자의 offer가 오지 않을 때의 자기 치유 예약 — 동시 입장 레이스로 상대가
  // SNAPSHOT을 유실하면(실서버 로그로 확인된 실사례) 기존 멤버 쪽에서 역방향 offer를 낸다.
  const fallbackOfferTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const listeners = new Set<(userId: number, stream: MediaStream | null) => void>();
  // PeerConnection당 발급하는 UUID — 보고의 연결 단위 중복 제거 키. 재수립 pc는 새 id를 받는다.
  const connectionIds = new Map<number, string>();
  // 직전 주기 샘플 — 종료 시 이 값을 isFinal로 한 번 더 흘려 종료 egress를 멱등하게 잡는다.
  const lastStatsSample = new Map<number, RtcStatRequest>();
  const statsTimers = new Map<number, ReturnType<typeof setInterval>>();
  const STATS_INTERVAL_MS = 60000;
  let localStream: MediaStream | null = null;
  let trackEnabled = true;
  let unsubscribe: (() => void) | null = null;

  const debug = (line: string) => onEvent?.(line);

  function notify(userId: number, stream: MediaStream | null) {
    if (stream !== null) {
      lastStreams.set(userId, stream);
    }
    for (const listener of listeners) {
      listener(userId, stream);
    }
  }

  type CandidateType = RtcStatRequest["candidateType"];
  const CANDIDATE_TYPES: readonly CandidateType[] = ["host", "srflx", "prflx", "relay"];
  type RelayProtocol = NonNullable<RtcStatRequest["relayProtocol"]>;
  const RELAY_PROTOCOLS: readonly RelayProtocol[] = ["udp", "tcp", "tls"];

  /** 선택된 후보 쌍에서 종류·바이트·RTT를 뽑는다. 진단용이라 어떤 실패도 삼킨다. */
  async function collectStats(
    pc: RTCPeerConnection,
  ): Promise<Omit<
    RtcStatRequest,
    "connectionId" | "roomId" | "userId" | "peerUserId" | "isFinal" | "at"
  > | null> {
    if (typeof pc.getStats !== "function") {
      return null;
    }
    type StatEntry = {
      id: string;
      type: string;
      selectedCandidatePairId?: string;
      nominated?: boolean;
      state?: string;
      localCandidateId?: string;
      candidateType?: string;
      relayProtocol?: string;
      bytesReceived?: number;
      bytesSent?: number;
      currentRoundTripTime?: number;
    };
    try {
      const report = await pc.getStats();
      const byId = new Map<string, StatEntry>();
      report.forEach((entry: StatEntry) => byId.set(entry.id, entry));
      let pair: StatEntry | undefined;
      for (const entry of byId.values()) {
        if (entry.type === "transport" && entry.selectedCandidatePairId !== undefined) {
          pair = byId.get(entry.selectedCandidatePairId);
        }
      }
      if (!pair) {
        // Firefox는 transport 통계가 없어 nominated 성공 쌍으로 대신 찾는다.
        for (const entry of byId.values()) {
          if (
            entry.type === "candidate-pair" &&
            entry.nominated === true &&
            entry.state === "succeeded"
          ) {
            pair = entry;
          }
        }
      }
      const local =
        pair?.localCandidateId !== undefined ? byId.get(pair.localCandidateId) : undefined;
      const candidateType = local?.candidateType;
      if (
        candidateType === undefined ||
        !CANDIDATE_TYPES.includes(candidateType as CandidateType)
      ) {
        return null;
      }
      // 잘못된 값(브라우저 편차)은 버린다 — 그대로 실어 보내면 백엔드가 요청 전체를 400 낸다.
      const relayProtocol =
        local?.relayProtocol !== undefined &&
        RELAY_PROTOCOLS.includes(local.relayProtocol as RelayProtocol)
          ? (local.relayProtocol as RelayProtocol)
          : undefined;
      // 음수·비유한 수는 버린다 — 백엔드 @PositiveOrZero가 요청 전체를 400 낸다.
      const nonNeg = (n: number | undefined): number | undefined =>
        typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
      const rttMs =
        pair?.currentRoundTripTime !== undefined
          ? Math.round(pair.currentRoundTripTime * 1000)
          : undefined;
      return {
        candidateType: candidateType as CandidateType,
        relayProtocol,
        bytesReceived: nonNeg(pair?.bytesReceived),
        bytesSent: nonNeg(pair?.bytesSent),
        rttMs: nonNeg(rttMs),
      };
    } catch {
      return null;
    }
  }

  /**
   * 한 연결의 샘플을 뽑아 보고하고 마지막 샘플로 캐시한다(종료 시 isFinal로 흘리기 위해).
   * 후보 쌍 종류(host·srflx·relay)는 STUN 직결인지 TURN 경유인지의 유일한 판별 신호라 디버그로도 남긴다.
   */
  async function sampleAndReport(userId: number, pc: RTCPeerConnection) {
    const connectionId = connectionIds.get(userId);
    if (connectionId === undefined) {
      return;
    }
    const sample = await collectStats(pc);
    if (!sample) {
      return;
    }
    // getStats가 늦게 돌아오는 사이 이 pc가 폐기·교체됐으면 버린다 — 새 pc의
    // connectionId로 낡은 샘플을 보고하는 것을 막는다.
    if (peers.get(userId) !== pc || connectionIds.get(userId) !== connectionId) {
      return;
    }
    debug(`path ${userId}: ${sample.candidateType}`);
    const payload: RtcStatRequest = {
      connectionId,
      roomId,
      userId: myUserId,
      peerUserId: userId,
      isFinal: false,
      at: Date.now(),
      ...sample,
    };
    lastStatsSample.set(userId, payload);
    reportStats?.(payload);
  }

  /** 타이머를 멈추고 캐시된 마지막 샘플을 isFinal:true로 한 번 보낸다. 멱등하다. */
  function finalizeStats(userId: number) {
    const timer = statsTimers.get(userId);
    if (timer !== undefined) {
      clearInterval(timer);
      statsTimers.delete(userId);
    }
    const cached = lastStatsSample.get(userId);
    if (cached !== undefined) {
      lastStatsSample.delete(userId);
      reportStats?.({ ...cached, isFinal: true, at: Date.now() });
    }
    connectionIds.delete(userId);
  }

  function localTrack(): MediaStreamTrack | null {
    return localStream?.getVideoTracks()[0] ?? null;
  }

  // 송출만 낮춘다 — 카메라 스트림은 추론 파이프라인이 고해상도로 쓰므로 건드리지 않는다.
  // 2026-08-25 BY-427: 240p/200kbps → 360p/350kbps 소폭 상향(실기기 "타일에서 흐릿" 피드백).
  // 프레임레이트 15는 유지 — 인코딩 부하·발열의 가장 큰 축이라 올리지 않는다. 최악의 업로드는
  // 5피어 × 350kbps ≈ 1.75Mbps(종전 1Mbps)로 모바일 핫스팟에서도 감당 가능한 수준.
  function applySendQuality(sender: RTCRtpSender, track: MediaStreamTrack) {
    const height = typeof track.getSettings === "function" ? track.getSettings().height : undefined;
    const scale = height !== undefined && height > 0 ? Math.max(1, height / 360) : 2;
    const params = sender.getParameters();
    const encodings = params.encodings.length > 0 ? params.encodings : [{}];
    encodings[0] = {
      ...encodings[0],
      maxBitrate: 350_000,
      maxFramerate: 15,
      scaleResolutionDownBy: scale,
    };
    void sender.setParameters({ ...params, encodings }).catch(() => undefined);
  }

  function preferVp8(pc: RTCPeerConnection) {
    if (typeof RTCRtpSender === "undefined" || typeof RTCRtpSender.getCapabilities !== "function") {
      return;
    }
    const capabilities = RTCRtpSender.getCapabilities("video");
    if (!capabilities || typeof pc.getTransceivers !== "function") {
      return;
    }
    const vp8First = [...capabilities.codecs].sort(
      (a, b) =>
        Number(b.mimeType.toLowerCase() === "video/vp8") -
        Number(a.mimeType.toLowerCase() === "video/vp8"),
    );
    for (const transceiver of pc.getTransceivers()) {
      transceiver.setCodecPreferences?.(vp8First);
    }
  }

  function attachLocalTrack(pc: RTCPeerConnection) {
    const track = localTrack();
    if (!track || !localStream) {
      // 카메라가 아직 안 열렸어도 송신 슬롯은 지금 예약한다 — offer에 미디어 라인이
      // 없으면 연결 성립 후 트랙을 붙여도 재협상 없이는 영원히 전송되지 않는다.
      if (typeof pc.addTransceiver === "function") {
        pc.addTransceiver("video", { direction: "sendrecv" });
      }
      return;
    }
    track.enabled = trackEnabled;
    const sender = pc.addTrack(track, localStream);
    applySendQuality(sender, track);
  }

  function getOrCreatePeer(userId: number): RTCPeerConnection {
    const existing = peers.get(userId);
    if (existing) {
      return existing;
    }
    const pc = createPeerConnection({ iceServers });
    peers.set(userId, pc);
    connectionIds.set(userId, crypto.randomUUID());
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        debug(`cand→${userId} ${/typ (\w+)/.exec(event.candidate.candidate ?? "")?.[1] ?? "?"}`);
        channel.publishSignal({ toUserId: userId, kind: "CANDIDATE", payload: event.candidate });
      }
    };
    pc.ontrack = (event) => {
      debug(`track←${userId}`);
      // 송신측이 슬롯 예약(addTransceiver) 뒤 replaceTrack으로 트랙을 실으면 스트림 묶음
      // 정보가 없어 streams가 빈 배열로 온다 — 트랙만으로 스트림을 만들어 쓴다.
      const stream =
        event.streams[0] ??
        (event.track !== undefined && typeof MediaStream !== "undefined"
          ? new MediaStream([event.track])
          : null);
      if (stream === null) {
        return;
      }
      // 트랙 객체는 신호 교환만 돼도 도착하지만 미디어 패킷은 연결이 성립해야 흐른다.
      // muted인 채 그리면 연결 실패 상대가 검은 화면으로 보인다 — 프레임이 흐르기
      // 시작하는 unmute에 통지해 그 전에는 타일이 아바타로 남게 한다.
      const track = event.track;
      if (track !== undefined) {
        track.onunmute = () => {
          debug(`unmute←${userId}`);
          notify(userId, stream);
        };
        // 프레임이 끊기면(상대 이탈·연결 열화) 마지막 프레임이 정지화면으로 남는다 —
        // 즉시 아바타로 되돌리고, 다시 흐르면 위 unmute가 복원한다.
        track.onmute = () => {
          debug(`mute←${userId}`);
          notify(userId, null);
        };
        track.onended = () => {
          debug(`ended←${userId}`);
          // 종료된 트랙은 복원 대상이 아니다 — 캐시에 남기면 ICE 복귀가 죽은 스트림을 되살린다.
          lastStreams.delete(userId);
          notify(userId, null);
        };
        if (track.muted) {
          return;
        }
      }
      notify(userId, stream);
    };
    pc.oniceconnectionstatechange = () => {
      debug(`ice ${userId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "connected") {
        restartAttempted.delete(userId);
        void sampleAndReport(userId, pc);
        if (!statsTimers.has(userId)) {
          statsTimers.set(
            userId,
            setInterval(() => {
              void sampleAndReport(userId, pc);
            }, STATS_INTERVAL_MS),
          );
        }
        // 일시 끊김에서 돌아왔다 — disconnected에서 내렸던 타일을 되살린다. 단 프레임이
        // 실제로 흐를 수 있는 트랙(live·비mute)일 때만이다. muted면 unmute가 복원을 맡는다.
        const last = lastStreams.get(userId);
        const lastTrack = last?.getVideoTracks()[0];
        if (last && lastTrack && lastTrack.readyState === "live" && lastTrack.muted === false) {
          notify(userId, last);
        }
        return;
      }
      // 끊김 감지 즉시 아바타로 — mute 이벤트는 웹뷰에 따라 발화가 늦거나 안 온다.
      if (pc.iceConnectionState === "disconnected") {
        notify(userId, null);
        return;
      }
      if (pc.iceConnectionState !== "failed") {
        return;
      }
      // 실패 시 offerer만 restart 재협상 1회 — restartIce()는 다음 offer가 ICE 재시작
      // SDP가 되도록 표시할 뿐이라, offer를 실제로 다시 보내야 복구가 시작된다.
      // 그래도 실패면 타일을 아바타로 되돌리고 조용히 둔다.
      if (offeredByMe.has(userId) && !restartAttempted.has(userId)) {
        restartAttempted.add(userId);
        pc.restartIce();
        startOffer(userId);
        return;
      }
      notify(userId, null);
    };
    attachLocalTrack(pc);
    preferVp8(pc);
    return pc;
  }

  async function sendOffer(userId: number) {
    debug(`offer→${userId}`);
    offeredByMe.add(userId);
    const pc = getOrCreatePeer(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channel.publishSignal({ toUserId: userId, kind: "OFFER", payload: offer });
  }

  // offer 생성 실패를 삼키면 그 상대만 소리 없이 영영 안 보인다 — 아바타로 내려 정직하게 둔다.
  function startOffer(userId: number) {
    sendOffer(userId).catch(() => {
      debug(`offer-err→${userId}`);
      notify(userId, null);
    });
  }

  // 신규 입장자가 3초 안에 offer를 못 보내면(스냅샷 유실 등) 이쪽에서 대신 제안한다.
  // 정상 경로에서는 그 전에 상대 offer로 연결이 생겨 발동하지 않는다.
  const FALLBACK_OFFER_DELAY_MS = 3000;
  function scheduleFallbackOffer(userId: number) {
    clearTimeout(fallbackOfferTimers.get(userId));
    fallbackOfferTimers.set(
      userId,
      setTimeout(() => {
        fallbackOfferTimers.delete(userId);
        if (!peers.has(userId)) {
          debug(`fallback-offer→${userId}`);
          startOffer(userId);
        }
      }, FALLBACK_OFFER_DELAY_MS),
    );
  }

  // 시그널은 다른 기기가 만든 외부 입력이다 — 모양이 계약과 다르면 여기서 버린다.
  function isSdpPayload(payload: unknown): payload is RTCSessionDescriptionInit {
    return (
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { sdp?: unknown }).sdp === "string"
    );
  }

  /** SDP의 DTLS 지문 줄 — 같은 RTCPeerConnection이 만든 SDP끼리는 재협상에도 동일하다. */
  function sdpFingerprint(sdp: string | undefined): string | null {
    return /a=fingerprint:[^\r\n]*/i.exec(sdp ?? "")?.[0] ?? null;
  }

  // 폐기 후 재수립용 정리 — MEMBER_LEFT와 달리 화면 통지는 하지 않는다(아직 스트림이
  // 없거나, 곧 새 연결이 대체한다).
  function discardPeer(userId: number) {
    const pc = peers.get(userId);
    if (!pc) {
      return;
    }
    finalizeStats(userId);
    pc.close();
    peers.delete(userId);
    restartAttempted.delete(userId);
    offeredByMe.delete(userId);
    lastStreams.delete(userId);
  }

  async function handleSignal(fromUserId: number, kind: RoomSignalKind, payload: unknown) {
    debug(`sig←${fromUserId} ${kind}`);
    if (kind === "OFFER") {
      if (!isSdpPayload(payload)) {
        return;
      }
      const existing = peers.get(fromUserId);
      if (existing) {
        const ice = existing.iceConnectionState;
        if (ice === "failed" || ice === "disconnected" || ice === "closed") {
          // 재입장 상대 — 죽은 연결을 재사용하면 상대→나 방향이 옛 경로에 남는다.
          // 폐기하고 새 연결로 answer해 양방향 모두 새 주소로 수립한다.
          debug(`stale-pc←${fromUserId}`);
          discardPeer(fromUserId);
        } else if (offeredByMe.has(fromUserId) && existing.remoteDescription === null) {
          // 동시 입장 글레어 — 서로가 서로의 SNAPSHOT에 신규로 들어가 양쪽 다 offer를
          // 보냈다. userId 큰 쪽이 offer 역할을 유지하고 작은 쪽이 양보한다: 양쪽이
          // 같은 규칙을 계산하므로 추가 통신 없이 역할이 갈린다.
          if (myUserId > fromUserId) {
            debug(`glare-ignore←${fromUserId}`);
            return;
          }
          debug(`glare-yield←${fromUserId}`);
          discardPeer(fromUserId);
        } else {
          // 상대가 연결을 **새로 만들어** 보낸 offer인지 판별한다 — 배경 복귀 재구축·
          // 웹뷰 재입장에서 상대는 새 PC로 offer를 보내는데, 내 쪽 낡은 PC의 ICE가
          // 아직 connected로 남아 있으면 위 stale 분기에 안 걸린다. DTLS 지문이 다른
          // offer를 기존 연결의 재협상으로 answer하면 핸드셰이크가 다시 성립하지 않아
          // 검은 화면·prflx 경로로 웨지된다(2026-08-26 5기기+서버 로그 실측: 재입장한
          // 144의 offer 3발에 전원이 answer했지만 미디어가 서지 않음). 지문이 다르면
          // 폐기하고 새 연결로 answer한다 — 같은 지문(같은 PC의 ICE 재시작 재협상)은
          // 기존 연결을 유지한다.
          const oldFingerprint = sdpFingerprint(existing.remoteDescription?.sdp);
          const newFingerprint = sdpFingerprint(payload.sdp);
          if (
            oldFingerprint !== null &&
            newFingerprint !== null &&
            oldFingerprint !== newFingerprint
          ) {
            debug(`new-pc←${fromUserId}`);
            discardPeer(fromUserId);
          }
        }
      }
      const pc = getOrCreatePeer(fromUserId);
      await pc.setRemoteDescription(payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.publishSignal({ toUserId: fromUserId, kind: "ANSWER", payload: answer });
      return;
    }
    const pc = peers.get(fromUserId);
    if (!pc) {
      return;
    }
    if (kind === "ANSWER") {
      if (!isSdpPayload(payload)) {
        return;
      }
      await pc.setRemoteDescription(payload);
      return;
    }
    await pc.addIceCandidate(payload as RTCIceCandidateInit).catch(() => undefined);
  }

  function closePeer(userId: number) {
    const pc = peers.get(userId);
    if (!pc) {
      return;
    }
    finalizeStats(userId);
    pc.close();
    peers.delete(userId);
    restartAttempted.delete(userId);
    offeredByMe.delete(userId);
    lastStreams.delete(userId);
    signalChains.delete(userId);
    clearTimeout(fallbackOfferTimers.get(userId));
    fallbackOfferTimers.delete(userId);
    notify(userId, null);
  }

  const handleMessage = (message: Parameters<Parameters<RoomChannel["subscribe"]>[0]>[0]) => {
    if (message.type === "SNAPSHOT") {
      let started = 0;
      for (const m of message.members) {
        if (m.userId === myUserId || peers.has(m.userId)) {
          continue;
        }
        startOffer(m.userId);
        started += 1;
      }
      // 동시 입장 레이스 진단용 — 스냅샷을 받았는지, offer 루프가 돌았는지를 기기에서 본다.
      debug(`snap ${message.members.length}명 offer ${started}발`);
      return;
    }
    if (message.type === "MEMBER_JOINED") {
      if (message.member.userId !== myUserId && !peers.has(message.member.userId)) {
        scheduleFallbackOffer(message.member.userId);
      }
      return;
    }
    if (message.type === "MEMBER_LEFT") {
      closePeer(message.userId);
      return;
    }
    if (message.type === "SIGNAL") {
      // 원격 서술 적용 실패(깨진 SDP 등)를 조용히 삼키면 그 상대만 영원히 안 보인다 —
      // 아바타로 내려 최소한 상태를 정직하게 만든다.
      const previous = signalChains.get(message.fromUserId) ?? Promise.resolve();
      const next = previous
        .then(() => handleSignal(message.fromUserId, message.kind, message.payload))
        .catch(() => {
          debug(`sig-err←${message.fromUserId}`);
          notify(message.fromUserId, null);
        });
      signalChains.set(message.fromUserId, next);
    }
  };

  return {
    start() {
      // 생성만으로는 아무 것도 구독하지 않는다 — StrictMode가 초기화를 두 번 돌려도
      // 버려진 인스턴스가 유령으로 남지 않는다.
      unsubscribe ??= channel.subscribe(handleMessage);
    },
    setLocalStream(stream) {
      localStream = stream;
      const track = localTrack();
      if (track) {
        track.enabled = trackEnabled;
      }
      for (const [userId, pc] of peers) {
        const sender = pc.getSenders()[0];
        if (sender) {
          // 한 상대의 replaceTrack 실패(전환 직후 등)가 미처리 rejection으로 남거나
          // 나머지 상대 갱신을 막지 않게 상대 단위로 격리한다.
          sender.replaceTrack(track).catch(() => debug(`track-err→${userId}`));
          if (track) {
            applySendQuality(sender, track);
          }
        } else if (track && localStream) {
          applySendQuality(pc.addTrack(track, localStream), track);
        }
        // 죽은 연결에 새 트랙을 실었으면 재협상까지 다시 건다 — Android 백그라운드
        // 복귀 후 카메라 켜기에서, 배경 중 죽은 ICE(1회 복구 시도는 JS 정지 구간에
        // 이미 소진됐을 수 있다)에 replaceTrack만 하면 내 화면엔 새 트랙이 보여도
        // 상대에겐 프레임이 영영 흐르지 않는다(2026-08-26 실기기: 수신측 검은 화면).
        // 새 트랙 실장은 새 복구 기회다 — offer 역할일 때만 낸다(glare 규칙). 상대
        // 방향의 회복은 상대측 동일 로직·failed 이벤트 경로가 맡는다.
        if (
          track !== null &&
          offeredByMe.has(userId) &&
          (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected")
        ) {
          debug(`track-revive→${userId}`);
          restartAttempted.delete(userId);
          pc.restartIce();
          startOffer(userId);
        }
      }
    },
    setTrackEnabled(enabled) {
      trackEnabled = enabled;
      const track = localTrack();
      if (track) {
        track.enabled = enabled;
      }
    },
    resetConnections() {
      debug(`reset ${peers.size}연결`);
      for (const userId of [...peers.keys()]) {
        closePeer(userId);
      }
    },
    subscribeRemoteStreams(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      unsubscribe?.();
      unsubscribe = null;
      for (const userId of [...peers.keys()]) {
        finalizeStats(userId);
      }
      for (const pc of peers.values()) {
        pc.close();
      }
      peers.clear();
      restartAttempted.clear();
      offeredByMe.clear();
      lastStreams.clear();
      signalChains.clear();
      for (const timer of fallbackOfferTimers.values()) {
        clearTimeout(timer);
      }
      fallbackOfferTimers.clear();
      for (const timer of statsTimers.values()) {
        clearInterval(timer);
      }
      statsTimers.clear();
      connectionIds.clear();
      lastStatsSample.clear();
    },
  };
}
