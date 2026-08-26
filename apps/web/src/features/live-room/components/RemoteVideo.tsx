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
