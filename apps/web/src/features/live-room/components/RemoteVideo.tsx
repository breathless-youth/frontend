import { useEffect, useRef } from "react";

import { startVideoPlayback, VIDEO_PLAYBACK_KICK_PROPS } from "@/lib/startVideoPlayback";

export function RemoteVideo({ userId, stream }: { userId: number; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
      startVideoPlayback(video);
    }
  });

  return (
    <video
      ref={videoRef}
      data-testid={`remote-video-${userId}`}
      playsInline
      muted
      {...VIDEO_PLAYBACK_KICK_PROPS}
      // pointer-events-none:
      // 탭이 video에 직접 닿으면 iOS가 네이티브 재생/일시정지 컨트롤을 띄운다.
      // 이 영상은 조작 대상이 아니므로 탭을 아래 레이어로 통과시킨다.
      className="amp-block sentry-block session-video pointer-events-none size-full object-cover"
    />
  );
}
