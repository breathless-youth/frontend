import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * 바 토글의 타일 이동·크기 변화를 FLIP(이전 위치로 transform 역적용 → 원위치)으로
 * 잇는다 — 바 슬라이드·글자 페이드와 **도착 시점을 맞춘다**(2026-08-26 피드백: 셋의
 * 속도가 어긋나 어색했다). 같은 500ms·iOS 시트 곡선이라 세 동작이 함께 정착한다.
 *
 * 방식이 FLIP인 이유: 높이·패딩 트랜지션은 영상 리플로우로 실기기 랙(6e827c9), 스크롤
 * 컨테이너(`room-grid`) transform은 WKWebView 타일 페인트 누락 사고가 있었다. FLIP은
 * 레이아웃을 즉시 확정하고 **타일 각각에만** transform 애니메이션을 걸어 둘 다 피한다.
 *
 * rect 저장은 매 커밋(의존성 없음) — 타일 ≤6개 측정이라 싸고, 토글 외의 렌더가 기준
 * rect를 최신으로 유지한다. 커밋 없이 rect가 바뀌는 사건(회전·스크롤)은 아래
 * invalidateFlipRects가 기준을 버려 가짜 비행을 막는다. 토글이 아닌 레이아웃 변화
 * (입장·퇴장)는 애니메이션하지 않는다(종전과 같은 즉시 반영). 가로에서는 바 토글이
 * 레이아웃을 바꾸지 않아 자연히 무동작이다.
 *
 * `rowsRef`는 타일 래퍼(`room-grid-rows`)에, `invalidateFlipRects`는 스크롤 컨테이너의
 * onScroll에 붙인다.
 */
export function useTileFlipAnimation(controlsVisible: boolean) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const prevTileRectsRef = useRef<ReadonlyMap<string, DOMRect>>(new Map());
  const prevControlsVisibleRef = useRef(controlsVisible);
  /**
   * 기준 rect 무효화 — 회전·스크롤은 React 커밋 없이 타일 위치를 바꾸므로, 그 직후 1초
   * 안의(다음 틱 렌더 전) 토글은 낡은 기준으로 수백 px 가짜 비행을 만든다(크로스리뷰 M3).
   * 이런 사건 뒤에는 기준을 버린다 — 그 직후 첫 토글은 prev가 없어 애니메이션 없이
   * 스냅되지만, 잘못된 비행보다 낫고 다음 커밋이 다시 잰다.
   */
  const invalidateFlipRects = useCallback(() => {
    prevTileRectsRef.current = new Map();
  }, []);
  useEffect(() => {
    window.addEventListener("resize", invalidateFlipRects);
    window.addEventListener("orientationchange", invalidateFlipRects);
    return () => {
      window.removeEventListener("resize", invalidateFlipRects);
      window.removeEventListener("orientationchange", invalidateFlipRects);
    };
  }, [invalidateFlipRects]);
  useLayoutEffect(() => {
    const controlsChanged = prevControlsVisibleRef.current !== controlsVisible;
    prevControlsVisibleRef.current = controlsVisible;
    const tiles = Array.from(
      rowsRef.current?.querySelectorAll<HTMLElement>('[data-testid="room-tile"]') ?? [],
    );
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rects = new Map<string, DOMRect>();
    for (const tile of tiles) {
      const key = tile.dataset.userId ?? "";
      // 연타 대비 — 달리는 FLIP이 있으면 취소 **전에** 변환이 포함된 rect(= 지금 화면에
      // 보이는 위치)를 재서 새 FLIP의 출발점으로 쓴다. 저장 맵의 rect는 직전 커밋의 도착
      // 레이아웃이라 그걸 쓰면 타일이 도착점으로 점프했다가 되돌아온다(크로스리뷰 M4 —
      // 500ms 안의 재토글은 틱 렌더가 끼기 전이라 맵이 mid-flight 위치를 모른다).
      let prevOverride: DOMRect | null = null;
      if (controlsChanged && typeof tile.getAnimations === "function") {
        const running = tile.getAnimations();
        if (running.length > 0) {
          prevOverride = tile.getBoundingClientRect();
          for (const animation of running) {
            animation.cancel();
          }
        }
      }
      const next = tile.getBoundingClientRect();
      const prev = prevOverride ?? prevTileRectsRef.current.get(key);
      rects.set(key, next);
      if (
        !controlsChanged ||
        reduceMotion ||
        typeof tile.animate !== "function" ||
        prev === undefined ||
        prev.width === 0 ||
        prev.height === 0 ||
        next.width === 0 ||
        next.height === 0
      ) {
        continue;
      }
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      const sx = prev.width / next.width;
      const sy = prev.height / next.height;
      if (
        Math.abs(dx) < 1 &&
        Math.abs(dy) < 1 &&
        Math.abs(sx - 1) < 0.01 &&
        Math.abs(sy - 1) < 0.01
      ) {
        continue;
      }
      tile.animate(
        [
          {
            transformOrigin: "top left",
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          },
          { transformOrigin: "top left", transform: "none" },
        ],
        // RoomControlBar 슬라이드·RoomTile 글자 페이드와 같은 500ms·시트 곡선 — 이 값이
        // 어긋나면 "도착 시점이 안 맞는다"는 어색함이 되살아난다. 셋을 함께 바꿀 것.
        { duration: 500, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      );
    }
    prevTileRectsRef.current = rects;
  });
  return { rowsRef, invalidateFlipRects };
}
