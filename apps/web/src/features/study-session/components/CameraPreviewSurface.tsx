import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * 카메라 피드 영역 (Figma `Session / Camera Preview BG` 58:109).
 *
 * 카메라가 도는 동안에는 `<video>`가 실제 피드를 그리고, 꺼져 있는 동안에는 Figma 목업과
 * 같은 중립 서피스(사선 밴드 + 라벨)를 그린다 — 권한 거부·기기 점유로 카메라가 없는 상태에서도
 * 화면이 검게 비지 않아야 한다.
 *
 * **스트림은 이 컴포넌트 밖으로 나가지 않는다.** `srcObject`에 붙이는 것 외의 용도로 쓰지 말 것
 * (원본 프레임 저장·전송 금지 — `frontend/CLAUDE.md`).
 *
 * UI가 카메라 SDK를 직접 호출하지 않는 경계는 유지된다 — `getUserMedia`는 어댑터가 부르고
 * 이 컴포넌트는 결과 스트림만 받는다.
 *
 * **가로(S3-5)에는 방향 델타가 없다** — 밴드 기하와 라벨 타이포가 세로와 같고, 여기서는 밴드를
 * `repeating-linear-gradient` 하나로 그리므로 어떤 뷰포트에서도 자동으로 채워진다.
 */
export interface CameraPreviewSurfaceProps {
  /** 카메라 어댑터가 실행 중인지 — false면 목업 텍스처를 노출한다. */
  isRunning: boolean;
  /** 어댑터가 연 스트림. `isRunning`이 true여도 렌더 타이밍상 잠깐 null일 수 있다. */
  stream: MediaStream | null;
  className?: string;
}

export function CameraPreviewSurface({ isRunning, stream, className }: CameraPreviewSurfaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.srcObject = stream;
    return () => {
      // 언마운트 시 참조를 끊는다 — 트랙 정지는 어댑터의 책임이다.
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div
      aria-hidden="true"
      data-session-surface="camera"
      className={cn("absolute inset-0 overflow-hidden bg-[var(--session-camera-base)]", className)}
    >
      {isRunning ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          // 전면 카메라는 거울처럼 보여야 자연스럽다. 추론은 원본 프레임을 쓰므로
          // 이 변환은 표시에만 영향을 준다.
          className="h-full w-full scale-x-[-1] object-cover"
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 55px, transparent 55px 110px)",
            }}
          />
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] leading-[14px] tracking-[2px] whitespace-nowrap text-white/16">
            [ 전 면 카 메 라 프 리 뷰 ]
          </p>
        </>
      )}
    </div>
  );
}
