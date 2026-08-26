import { useEffect, useRef } from "react";

import { kickVideoPlayback } from "@/lib/videoPlayback";

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
