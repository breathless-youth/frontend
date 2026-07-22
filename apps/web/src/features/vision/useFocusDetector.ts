import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * 카메라 프레임에서 얼굴 존재 여부로 집중/이석 상태를 추정하는 훅 — 브라우저 독립 구현체.
 * 브라우저 MediaPipe(WASM/WebGL)로 클라이언트에서만 추론하며 원본 프레임·얼굴 데이터를 서버로
 * 보내지 않는다. 모바일의 온디바이스 Vision(platform/vision)과 SDK를 공유하지 않는다.
 * 실제 판정 로직(시선, 자세 등)은 백엔드/모델 튜닝과 함께 후속 작업에서 고도화한다.
 * 지금은 MediaPipe 모델 로딩과 프레임 루프 배선만 제공하는 placeholder다.
 */
export function useFocusDetector(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isFocused, setIsFocused] = useState(false);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  useEffect(() => {
    let cancelled = false;
    let rafId: number;

    async function setup() {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      if (cancelled) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;

      const detectFrame = () => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && landmarkerRef.current) {
          const result = landmarkerRef.current.detectForVideo(video, performance.now());
          setIsFocused(result.faceLandmarks.length > 0);
        }
        rafId = requestAnimationFrame(detectFrame);
      };
      detectFrame();
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      landmarkerRef.current?.close();
    };
  }, [videoRef]);

  return { isFocused };
}
