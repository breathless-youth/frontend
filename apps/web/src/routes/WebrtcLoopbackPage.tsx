import { useEffect, useRef, useState } from "react";

import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";

/**
 * DEV 전용 WebRTC 루프백 스파이크 페이지.
 *
 * 한 페이지 안에서 PC 2개를 직접 연결해 getUserMedia와 RTCPeerConnection의 공존,
 * 240p·15fps·200kbps 송출 인코딩을 확인한다. 시그널링 서버가 필요 없어 실기기
 * 웹뷰에서 바로 열어볼 수 있다 — iOS WKWebView 공존 검증이 목적이다.
 * peerMesh를 쓰지 않고 표준 API만 부른다: 프레임워크 개입 없는 원층 확인이 목적이라서다.
 */
type LoopbackStats = {
  codec: string;
  resolution: string;
  bitrateKbps: number;
};

export function WebrtcLoopbackPage() {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<LoopbackStats | null>(null);

  const supported = typeof RTCPeerConnection !== "undefined";

  useEffect(() => {
    if (!supported) {
      return;
    }
    let cancelled = false;
    const sender = new RTCPeerConnection();
    const receiver = new RTCPeerConnection();
    let stream: MediaStream | null = null;
    let statsTimer: ReturnType<typeof setInterval> | null = null;
    let lastBytes = 0;
    let lastAt = 0;

    sender.onicecandidate = (event) => {
      if (event.candidate) {
        void receiver.addIceCandidate(event.candidate).catch(() => undefined);
      }
    };
    receiver.onicecandidate = (event) => {
      if (event.candidate) {
        void sender.addIceCandidate(event.candidate).catch(() => undefined);
      }
    };
    receiver.ontrack = (event) => {
      if (remoteRef.current && event.streams[0]) {
        remoteRef.current.srcObject = event.streams[0];
      }
    };

    async function run() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      if (cancelled) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      if (localRef.current) {
        localRef.current.srcObject = stream;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error("비디오 트랙이 없습니다");
      }
      const rtpSender = sender.addTrack(track, stream);
      const height = track.getSettings().height;
      const params = rtpSender.getParameters();
      const encodings = params.encodings.length > 0 ? params.encodings : [{}];
      encodings[0] = {
        ...encodings[0],
        maxBitrate: 200_000,
        maxFramerate: 15,
        scaleResolutionDownBy: height !== undefined && height > 0 ? Math.max(1, height / 240) : 3,
      };
      await rtpSender.setParameters({ ...params, encodings }).catch(() => undefined);

      const offer = await sender.createOffer();
      await sender.setLocalDescription(offer);
      await receiver.setRemoteDescription(offer);
      const answer = await receiver.createAnswer();
      await receiver.setLocalDescription(answer);
      await sender.setRemoteDescription(answer);

      statsTimer = setInterval(() => {
        void receiver.getStats().then((report) => {
          report.forEach((entry) => {
            if (entry.type !== "inbound-rtp" || entry.kind !== "video") {
              return;
            }
            const bytes = (entry.bytesReceived as number) ?? 0;
            const now = Date.now();
            const kbps =
              lastAt > 0 ? Math.round(((bytes - lastBytes) * 8) / Math.max(1, now - lastAt)) : 0;
            lastBytes = bytes;
            lastAt = now;
            const codecId = entry.codecId as string | undefined;
            const codec = codecId
              ? ((report.get(codecId) as { mimeType?: string } | undefined)?.mimeType ?? "?")
              : "?";
            setStats({
              codec,
              resolution: `${entry.frameWidth ?? "?"}×${entry.frameHeight ?? "?"}`,
              bitrateKbps: kbps,
            });
          });
        });
      }, 1000);
    }

    run().catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });

    return () => {
      cancelled = true;
      if (statsTimer !== null) {
        clearInterval(statsTimer);
      }
      sender.close();
      receiver.close();
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [supported]);

  if (!supported) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
        <p>이 환경에서는 WebRTC를 지원하지 않아요.</p>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-dvh flex-col gap-4 bg-background p-4 text-foreground"
      style={sessionSurfaceStyle}
    >
      <h1 className="text-lg font-bold">WebRTC 루프백 스파이크</h1>
      <p className="text-sm text-muted-foreground">
        카메라 스트림을 같은 페이지의 두 번째 연결로 보내 수신 화질을 확인합니다.
      </p>
      {error !== null && (
        <p role="alert" className="text-sm text-state-distract-text">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <figure>
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="amp-block aspect-video w-full rounded-xl bg-[var(--session-dialog-bg)] object-cover"
          />
          <figcaption className="mt-1 text-xs text-muted-foreground">원본 (송출측)</figcaption>
        </figure>
        <figure>
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            muted
            className="amp-block aspect-video w-full rounded-xl bg-[var(--session-dialog-bg)] object-cover"
          />
          <figcaption className="mt-1 text-xs text-muted-foreground">수신 (240p 목표)</figcaption>
        </figure>
      </div>
      <dl className="text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">코덱</dt>
          <dd>{stats?.codec ?? "측정 중"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">수신 해상도</dt>
          <dd>{stats?.resolution ?? "측정 중"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">수신 비트레이트</dt>
          <dd>{stats === null ? "측정 중" : `${stats.bitrateKbps}kbps`}</dd>
        </div>
      </dl>
    </main>
  );
}
