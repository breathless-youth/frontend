import { useEffect, useRef } from "react";

import { startVideoPlayback, VIDEO_PLAYBACK_KICK_PROPS } from "@/lib/startVideoPlayback";
import { kickVideoPlayback } from "@/lib/videoPlayback";

/** 정체 점검 주기와, 마지막으로 그려진 프레임 이후 재장착까지의 대기 시간. */
const STALL_CHECK_INTERVAL_MS = 2000;
const STALL_REATTACH_AFTER_MS = 4000;

export function RemoteVideo({ userId, stream }: { userId: number; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
      startVideoPlayback(video);
    }
    // autoplay 속성만으로는 iOS WKWebView에서 재생이 시작되지 않을 수 있다 —
    // 사유·재시도 규칙은 kickVideoPlayback 주석 참고(2026-08-26 실기기).
    if (video) {
      kickVideoPlayback(video);
    }
  });

  /**
   * 수신 렌더 정지 자가 치유 — 트랙은 live·unmuted인데 **실제로 그려진 프레임**
   * (requestVideoFrameCallback)이 한동안 없으면 srcObject를 재장착한다. Chrome/
   * Android WebView에는 프레임을 받고도 기존 video 엘리먼트에 렌더하지 않는 알려진
   * 버그가 있다(twilio-video#931 계열). 실기기(2026-08-26): 송신자가 백그라운드에
   * 다녀온 뒤 카메라를 켜면 송신측 셀프뷰·연결은 정상인데 수신측만 검은 화면.
   *
   * ⚠️ 판정 신호를 getVideoPlaybackQuality 폴링에서 rVFC로 교체했다 — 일부 기기에서
   * WebRTC 스트림의 프레임 카운터가 갱신되지 않아 **멀쩡한 화면을 4초마다 재장착하는
   * 오탐**(전체 타일 깜빡임, 2026-08-26 실기기)을 냈다. rVFC는 "합성기에 실제로 그려진
   * 프레임"마다 불려 정상 재생에서는 절대 조용하지 않다. 미지원 환경(jsdom 등)은
   * 감시가 조용히 무동작이다. muted 트랙(프레임이 정말 없음)은 감시를 쉰다.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (video === null || typeof video.requestVideoFrameCallback !== "function") {
      return;
    }
    let disposed = false;
    let lastFrameAt = Date.now();
    let handle = 0;
    const onFrame = () => {
      lastFrameAt = Date.now();
      if (!disposed) {
        handle = video.requestVideoFrameCallback(onFrame);
      }
    };
    handle = video.requestVideoFrameCallback(onFrame);
    const timer = setInterval(() => {
      const track = stream.getVideoTracks()[0];
      if (track === undefined || track.readyState !== "live" || track.muted) {
        lastFrameAt = Date.now(); // 프레임이 없어야 정상인 구간 — 정체로 치지 않는다.
        return;
      }
      if (Date.now() - lastFrameAt < STALL_REATTACH_AFTER_MS) {
        return;
      }
      lastFrameAt = Date.now();
      video.srcObject = null;
      video.srcObject = stream;
      kickVideoPlayback(video);
      // 재장착이 진행 중이던 콜백 체인을 끊을 수 있어 다시 무장한다.
      video.cancelVideoFrameCallback?.(handle);
      handle = video.requestVideoFrameCallback(onFrame);
    }, STALL_CHECK_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
      video.cancelVideoFrameCallback?.(handle);
    };
  }, [stream]);

  return (
    // cover 고정(2026-08-26 디스코드 참조 확정): 정사각 타일에서는 가로·세로 송신자 모두
    // 긴 축이 대칭(~44%)으로 잘려 방향 혼합의 프레이밍 차이가 온건하다 — 방향별 제한
    // 크롭·레터박스 실험(useAdaptiveVideoFit)은 이 결정으로 걷어냈다.
    <video
      ref={videoRef}
      data-testid={`remote-video-${userId}`}
      playsInline
      muted
      {...VIDEO_PLAYBACK_KICK_PROPS}
      // pointer-events-none:
      // 탭이 video에 직접 닿으면 iOS가 네이티브 재생/일시정지 컨트롤을 띄운다.
      // 이 영상은 조작 대상이 아니므로 탭을 아래 레이어로 통과시킨다.
      className="amp-block sentry-block pointer-events-none size-full object-cover"
    />
  );
}
