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
 *
 * `targetAspect`(확정 후 셀프뷰가 놓일 서피스의 가로/세로 비율)가 오면 그 비율의 프레임을
 * 모달 박스 안에 레터박스로 세워 **같은 영역이 잘리게** 한다 — 박스(288×234)와 서피스
 * (세로 풀스크린·타일)는 비율이 크게 달라, 둘 다 cover면 미리보기가 실제보다 훨씬 좁게
 * 보였다(2026-08-25 실기기 확인). 측정 실패(undefined) 시에는 종전대로 박스를 채운다.
 */
export function ClonedTrackPreview({
  stream,
  facing,
  targetAspect,
}: {
  stream: MediaStream | null;
  facing: CameraAdapter["facing"];
  targetAspect?: number;
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
  const video = (
    <video
      ref={videoRef}
      data-testid="camera-dialog-preview"
      autoPlay
      playsInline
      muted
      className={cn("amp-block size-full object-cover", facing === "front" && "scale-x-[-1]")}
    />
  );
  if (targetAspect === undefined) {
    return video;
  }
  return (
    <div className="flex size-full items-center justify-center">
      {/* 서피스는 항상 박스보다 세로형이라 h-full 기준으로 폭이 비율을 따른다. 가로 회전 등으로
          비율이 박스보다 넓어지면 max-w가 폭만 자르는데, 그때도 cover라 프레이밍은 근사한다. */}
      <div
        data-testid="camera-dialog-preview-frame"
        className="h-full max-w-full overflow-hidden"
        style={{ aspectRatio: targetAspect }}
      >
        {video}
      </div>
    </div>
  );
}
