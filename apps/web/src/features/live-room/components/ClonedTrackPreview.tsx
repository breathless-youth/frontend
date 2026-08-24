import { useEffect, useRef } from "react";

import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { cn } from "@/lib/utils";

/**
 * UI
 * 카메라 켜기 확인 모달 전용 미리보기
 *
 * 카메라를 끄면 송신 트랙 자체가 꺼져서(상대에게 검은 화면) 그 트랙을 그대로 그리면
 * 미리보기도 검다. 복제 트랙은 켜도 원본에 영향이 없어, 확인 전에 상대에게 영상이
 * 새 나가지 않으면서 내 모습만 실시간으로 보여줄 수 있다.
 */
export function ClonedTrackPreview({
  stream,
  facing,
}: {
  stream: MediaStream | null;
  facing: CameraAdapter["facing"];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    const video = videoRef.current;
    if (!track || !video || typeof track.clone !== "function") {
      return;
    }
    const clone = track.clone();
    clone.enabled = true;
    video.srcObject = new MediaStream([clone]);
    return () => {
      clone.stop();
    };
  }, [stream]);
  return (
    <video
      ref={videoRef}
      data-testid="camera-dialog-preview"
      autoPlay
      playsInline
      muted
      className={cn(
        "amp-block sentry-block size-full object-cover",
        facing === "front" && "scale-x-[-1]",
      )}
    />
  );
}
