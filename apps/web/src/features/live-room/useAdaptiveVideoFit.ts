import { useEffect, useState, type RefObject } from "react";

export type VideoFit = "cover" | "contain";

/**
 * 영상 fit 적응 — 스트림 방향(가로/세로)과 타일 박스 방향이 어긋나면 cover 대신
 * contain(레터박스)을 쓴다.
 *
 * 송출 프레임의 비율은 **송신자 기기 방향**을 따라 바뀐다(가로로 돌리면 와이드 캡처 —
 * 캡처 비율 고정은 화각만 줄이는 순손해라 금지, visionConfig.ts CAMERA_CONSTRAINTS).
 * 그래서 송신자와 시청자의 방향이 어긋나면 cover가 프레임의 대부분을 잘라내 "내가 보는
 * 내 화면과 상대가 보는 내 화면이 다르다"가 된다(2026-08-26 실기기 — 양방향 모두).
 * 방향이 어긋난 조합에서만 contain으로 **전체 프레임**을 보여주면, 어느 조합에서든
 * 모두가 같은 내용을 본다 — 레터박스 여백은 타일 배경(다크)이 자연스럽게 채운다.
 * 방향이 맞는 조합은 종전처럼 cover로 타일을 꽉 채운다.
 *
 * 재평가 시점: 스트림 치수 변경(송신자 회전 → video 'resize'), 메타데이터 도착,
 * 내 회전/리사이즈. effect를 의존성 없이 매 렌더 재부착하는 이유는 타일 재마운트
 * (tileLayoutEpoch)로 video 엘리먼트가 통째로 바뀌어도 ref 객체는 그대로라 — 렌더마다
 * 현재 엘리먼트에 다시 걸어야 하기 때문이다. 세션 화면은 초 단위 재렌더가 있어 회전
 * 전환 중의 어긋난 측정도 다음 렌더에서 자기 치유된다.
 */
export function useAdaptiveVideoFit(videoRef: RefObject<HTMLVideoElement | null>): VideoFit {
  const [fit, setFit] = useState<VideoFit>("cover");
  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    const apply = () => {
      if (
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        video.clientWidth === 0 ||
        video.clientHeight === 0
      ) {
        return; // 치수를 모르면 판단하지 않는다 — 마지막 값(기본 cover) 유지.
      }
      const streamWide = video.videoWidth > video.videoHeight;
      const boxWide = video.clientWidth > video.clientHeight;
      setFit(streamWide === boxWide ? "cover" : "contain");
    };
    apply();
    video.addEventListener("resize", apply);
    video.addEventListener("loadedmetadata", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      video.removeEventListener("resize", apply);
      video.removeEventListener("loadedmetadata", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  });
  return fit;
}
