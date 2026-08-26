import { useEffect, useRef } from "react";

import { kickVideoPlayback } from "@/lib/videoPlayback";

/** 프레임 정체 판정 주기와 연속 정체 허용 틱 — 2틱(≈4초) 정체면 재장착한다. */
const STALL_CHECK_INTERVAL_MS = 2000;
const STALL_TICKS_BEFORE_REATTACH = 2;

export function RemoteVideo({ userId, stream }: { userId: number; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
    }
    // autoplay 속성만으로는 iOS WKWebView에서 재생이 시작되지 않을 수 있다 —
    // 사유·재시도 규칙은 kickVideoPlayback 주석 참고(2026-08-26 실기기).
    if (video) {
      kickVideoPlayback(video);
    }
  });

  /**
   * 수신 렌더 정지 자가 치유 — 트랙은 live·unmuted(프레임 수신 중)인데 디코드 프레임
   * 수가 늘지 않으면 srcObject를 재장착한다. Chrome/Android WebView에는 프레임을
   * 받고도 기존 video 엘리먼트에 렌더하지 않는 알려진 버그가 있다(twilio-video#931
   * 계열). 실기기(2026-08-26): 송신자가 백그라운드에 다녀온 뒤 카메라를 켜면 송신측
   * 셀프뷰·연결은 정상인데 수신측만 검은 화면 — 수신 webview가 mute/unmute 이벤트를
   * 흘린 채(이 저장소의 peerMesh 주석대로 발화가 늦거나 안 온다) 엘리먼트가 정지된
   * 상태다. 재장착이 디코더-엘리먼트 결합을 새로 만든다.
   *
   * 오탐 방어: muted(프레임이 정말 없음)·ended 트랙은 감시를 쉬고, 송신측이
   * enabled=false로 보내는 검은 프레임은 프레임 수가 계속 늘므로 재장착하지 않는다.
   * getVideoPlaybackQuality 미지원 환경(jsdom 등)은 감시가 조용히 무동작이다.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    let lastFrames = -1;
    let stalledTicks = 0;
    const timer = setInterval(() => {
      const track = stream.getVideoTracks()[0];
      if (track === undefined || track.readyState !== "live" || track.muted) {
        lastFrames = -1;
        stalledTicks = 0;
        return;
      }
      const frames = video.getVideoPlaybackQuality?.().totalVideoFrames;
      if (frames === undefined) {
        return;
      }
      if (frames === lastFrames) {
        stalledTicks += 1;
        if (stalledTicks >= STALL_TICKS_BEFORE_REATTACH) {
          stalledTicks = 0;
          video.srcObject = null;
          video.srcObject = stream;
          kickVideoPlayback(video);
        }
      } else {
        stalledTicks = 0;
      }
      lastFrames = frames;
    }, STALL_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [stream]);

  return (
    // cover 고정(2026-08-26 디스코드 참조 확정): 정사각 타일에서는 가로·세로 송신자 모두
    // 긴 축이 대칭(~44%)으로 잘려 방향 혼합의 프레이밍 차이가 온건하다 — 방향별 제한
    // 크롭·레터박스 실험(useAdaptiveVideoFit)은 이 결정으로 걷어냈다.
    <video
      ref={videoRef}
      data-testid={`remote-video-${userId}`}
      autoPlay
      playsInline
      muted
      className="amp-block sentry-block size-full object-cover"
    />
  );
}
