import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 켜기 모달 미리보기가 실제 셀프뷰와 같은 영역이 잘리도록, 셀프뷰가 놓일 서피스
 * (1인 풀스크린 컨테이너 또는 내 타일)를 모달 여는 순간 재서 비율을 넘긴다 — 모달
 * 박스(288×234)와 서피스는 비율이 크게 달라 cover 크롭이 다르게 잘렸다(2026-08-25).
 *
 * `open`(카메라 켜기 모달 열림)이 참인 동안 회전·리사이즈마다 다시 잰다.
 */
export function useCameraPreviewAspect(open: boolean) {
  const selfSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [previewAspect, setPreviewAspect] = useState<number | null>(null);
  const measurePreviewAspect = useCallback(() => {
    const rect = selfSurfaceRef.current?.getBoundingClientRect();
    setPreviewAspect(rect !== undefined && rect.height > 0 ? rect.width / rect.height : null);
  }, []);
  // 모달이 열린 채 회전하면 셀프뷰 서피스 비율이 바뀐다(가로 3:2 등) — 열 때 한 번 잰
  // 값이 낡아 세로 레터박스가 가로에 그대로 남았다(2026-08-25 실기기). 열려 있는 동안
  // 리사이즈(회전)마다 다시 잰다. iOS 회전은 resize 시점에 레이아웃이 아직 정착 전이라
  // 즉시 읽으면 중간 치수가 잡힌다 — 다음 프레임에 재고, 정착 지연 대비로 350ms 뒤
  // 한 번 더 잰다(가로에서 바로 열었을 때와 크기가 달랐던 원인).
  useEffect(() => {
    if (!open) {
      return;
    }
    let raf = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measurePreviewAspect();
        if (settleTimer !== null) {
          clearTimeout(settleTimer);
        }
        settleTimer = setTimeout(measurePreviewAspect, 350);
      });
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    return () => {
      cancelAnimationFrame(raf);
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
      }
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
    };
  }, [open, measurePreviewAspect]);
  return { selfSurfaceRef, previewAspect, measurePreviewAspect };
}
