import { useEffect, useRef } from "react";

export function RemoteVideo({ userId, stream }: { userId: number; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
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
